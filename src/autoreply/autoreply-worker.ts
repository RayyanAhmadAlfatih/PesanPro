import { setTimeout as sleep } from "node:timers/promises";
import {
  claimNextAutoReplyTrigger,
  DEFAULT_AUTOREPLY_LEASE_MS,
  failClaimedAutoReply,
  heartbeatAutoReplyTrigger,
  processClaimedAutoReply,
  recoverAutoReplyClaimsForWorker,
  type ClaimedAutoReplyTrigger,
} from "@/lib/autoreply-queue";
import { logger } from "@/lib/logger";
import type { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

export class AutoReplyWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: { workerId: string; pollMs?: number; leaseMs?: number; healthReporter?: Pick<RuntimeHeartbeatReporter, "markHealthy" | "reportError"> }) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("AutoReplyWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverAutoReplyClaimsForWorker(this.options.workerId);
    logger.info("AutoReplyWorker", `Stopped ${this.options.workerId}; recovered ${recovered} claim(s)`);
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 1000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_AUTOREPLY_LEASE_MS;
    while (this.running) {
      let claim: ClaimedAutoReplyTrigger | null = null;
      try {
        claim = await claimNextAutoReplyTrigger(this.options.workerId, leaseMs);
        await this.options.healthReporter?.markHealthy();
        if (!claim) {
          await sleep(pollMs);
          continue;
        }
        const heartbeat = setInterval(() => {
          void heartbeatAutoReplyTrigger(claim!.trigger.id, claim!.claimToken, leaseMs)
            .catch((error) => logger.error("AutoReplyWorker", "Heartbeat failed", error));
        }, Math.max(1000, Math.floor(leaseMs / 3)));
        heartbeat.unref?.();
        try {
          const result = await processClaimedAutoReply(claim);
          logger.info("AutoReplyWorker", `${claim.trigger.id} ${result.action}`);
        } catch (error) {
          const result = await failClaimedAutoReply(claim, error);
          logger.warn("AutoReplyWorker", `${claim.trigger.id} ${result.retrying ? "will retry" : "finished"}: ${result.code}`);
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        await this.options.healthReporter?.reportError("AUTOREPLY_QUEUE_POLL_FAILED", error);
        logger.error("AutoReplyWorker", claim ? `Unexpected error for ${claim.trigger.id}` : "Polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
