import { setTimeout as sleep } from "node:timers/promises";
import {
  claimNextDueBroadcast,
  DEFAULT_BROADCAST_LEASE_MS,
  executeClaimedBroadcast,
  failClaimedBroadcast,
  heartbeatBroadcast,
  recoverBroadcastsForWorker,
  type ClaimedBroadcast,
} from "@/lib/broadcast-queue";
import { logger } from "@/lib/logger";
import type { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

export class BroadcastWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: { workerId: string; pollMs?: number; leaseMs?: number; healthReporter?: Pick<RuntimeHeartbeatReporter, "markHealthy" | "reportError"> }) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("BroadcastWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverBroadcastsForWorker(this.options.workerId);
    logger.info("BroadcastWorker", `Stopped ${this.options.workerId}; recovered ${recovered} claim(s)`);
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 1000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_BROADCAST_LEASE_MS;
    while (this.running) {
      let claim: ClaimedBroadcast | null = null;
      try {
        claim = await claimNextDueBroadcast(this.options.workerId, leaseMs);
        await this.options.healthReporter?.markHealthy();
        if (!claim) {
          await sleep(pollMs);
          continue;
        }
        const heartbeat = setInterval(() => {
          void heartbeatBroadcast(claim!.broadcast.id, claim!.claimToken, leaseMs)
            .catch((error) => logger.error("BroadcastWorker", "Heartbeat failed", error));
        }, Math.max(1000, Math.floor(leaseMs / 3)));
        heartbeat.unref?.();
        try {
          const result = await executeClaimedBroadcast(claim);
          logger.info("BroadcastWorker", `${claim.broadcast.id} ${result.action}`);
        } catch (error) {
          const result = await failClaimedBroadcast(claim, error);
          logger.warn("BroadcastWorker", `${claim.broadcast.id} ${result.retrying ? "will retry" : "failed"}: ${result.code}`);
        } finally {
          clearInterval(heartbeat);
        }
      } catch (error) {
        await this.options.healthReporter?.reportError("BROADCAST_QUEUE_POLL_FAILED", error);
        logger.error("BroadcastWorker", claim ? `Unexpected error for ${claim.broadcast.id}` : "Polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
