import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "@/lib/logger";
import type { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";
import {
  claimNextDueSchedule,
  DEFAULT_SCHEDULE_LEASE_MS,
  executeClaimedSchedule,
  failClaimedSchedule,
  heartbeatSchedule,
  recoverSchedulesForWorker,
  type ClaimedSchedule,
} from "@/lib/schedule-queue";

export class ScheduleWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: { workerId: string; pollMs?: number; leaseMs?: number; healthReporter?: Pick<RuntimeHeartbeatReporter, "markHealthy" | "reportError"> }) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("ScheduleWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverSchedulesForWorker(this.options.workerId);
    logger.info("ScheduleWorker", `Stopped ${this.options.workerId}; recovered ${recovered} claim(s)`);
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 1000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_SCHEDULE_LEASE_MS;
    while (this.running) {
      let claim: ClaimedSchedule | null = null;
      try {
        claim = await claimNextDueSchedule(this.options.workerId, leaseMs);
        await this.options.healthReporter?.markHealthy();
        if (!claim) {
          await sleep(pollMs);
          continue;
        }
        const heartbeat = setInterval(() => {
          void heartbeatSchedule(claim!.schedule.id, claim!.claimToken, leaseMs).catch((error) => logger.error("ScheduleWorker", "Heartbeat failed", error));
        }, Math.max(1000, Math.floor(leaseMs / 3)));
        heartbeat.unref?.();
        try {
          const result = await executeClaimedSchedule(claim);
          logger.info("ScheduleWorker", `${claim.schedule.id} ${result.action}`);
        } catch (error) {
          const result = await failClaimedSchedule(claim, error);
          logger.warn("ScheduleWorker", `${claim.schedule.id} ${result.retrying ? "will retry" : "failed"}: ${result.code}`);
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        await this.options.healthReporter?.reportError("SCHEDULE_QUEUE_POLL_FAILED", error);
        logger.error("ScheduleWorker", claim ? `Unexpected error for ${claim.schedule.id}` : "Polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
