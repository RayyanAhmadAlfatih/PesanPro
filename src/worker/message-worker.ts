import { setTimeout as sleep } from "node:timers/promises";
import {
  claimNextMessageJob,
  completeMessageJob,
  DEFAULT_MESSAGE_LEASE_MS,
  failMessageJob,
  heartbeatMessageJob,
  recoverMessageJobsForWorker,
  type ClaimedMessageJob,
} from "@/lib/message-queue";
import { logger } from "@/lib/logger";
import type { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

export type MessageDispatcher = (job: ClaimedMessageJob) => Promise<{ whatsappMessageId: string }>;

export class MessageQueueWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly options: {
      workerId: string;
      dispatcher: MessageDispatcher;
      pollMs?: number;
      leaseMs?: number;
      healthReporter?: Pick<RuntimeHeartbeatReporter, "markHealthy" | "reportError">;
    },
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("MessageWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverMessageJobsForWorker(this.options.workerId);
    logger.info("MessageWorker", `Stopped ${this.options.workerId}; recovered ${recovered} claim(s)`);
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 1000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_MESSAGE_LEASE_MS;
    while (this.running) {
      let job: ClaimedMessageJob | null = null;
      try {
        job = await claimNextMessageJob(this.options.workerId, leaseMs);
        await this.options.healthReporter?.markHealthy();
        if (!job) {
          await sleep(pollMs);
          continue;
        }

        const heartbeat = setInterval(() => {
          void heartbeatMessageJob(job!.id, job!.claimToken, leaseMs).catch((error) => {
            logger.error("MessageWorker", `Heartbeat failed for ${job!.id}`, error);
          });
        }, Math.max(1000, Math.floor(leaseMs / 3)));
        heartbeat.unref?.();
        try {
          const result = await this.options.dispatcher(job);
          const completed = await completeMessageJob(job, result.whatsappMessageId);
          if (!completed) logger.warn("MessageWorker", `Lease was lost before completing ${job.id}`);
        } catch (error) {
          const failed = await failMessageJob(job, error);
          logger.warn("MessageWorker", `Job ${job.id} ${failed.retrying ? "will retry" : "failed"}: ${failed.error.code}`);
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        await this.options.healthReporter?.reportError("MESSAGE_QUEUE_POLL_FAILED", error);
        logger.error("MessageWorker", job ? `Unexpected error for ${job.id}` : "Queue polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
