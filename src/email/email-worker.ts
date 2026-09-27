import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "@/lib/logger";
import {
  claimNextEmail,
  DEFAULT_EMAIL_LEASE_MS,
  executeClaimedEmail,
  failClaimedEmail,
  heartbeatEmail,
  recoverEmailClaimsForWorker,
  type ClaimedEmail,
} from "@/lib/email-outbox";

export class EmailWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: { workerId: string; pollMs?: number; leaseMs?: number }) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("EmailWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverEmailClaimsForWorker(this.options.workerId);
    logger.info("EmailWorker", `Stopped ${this.options.workerId}; recovered ${recovered} email claim(s)`);
  }

  private async process(claim: ClaimedEmail, leaseMs: number) {
    const heartbeat = setInterval(() => {
      void heartbeatEmail(claim.email.id, claim.claimToken, leaseMs)
        .catch((error) => logger.error("EmailWorker", "Heartbeat failed", error));
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    heartbeat.unref?.();
    try {
      const result = await executeClaimedEmail(claim);
      logger.info("EmailWorker", `Email ${claim.email.id} ${result.action}`);
    } catch (error) {
      const result = await failClaimedEmail(claim, error);
      logger.warn("EmailWorker", `Email ${claim.email.id} ${result.retrying ? "will retry" : "dead-lettered"}: ${result.code}`);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 2000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_EMAIL_LEASE_MS;
    while (this.running) {
      try {
        const email = await claimNextEmail(this.options.workerId, leaseMs);
        if (email) await this.process(email, leaseMs);
        else await sleep(pollMs);
      } catch (error) {
        logger.error("EmailWorker", "Polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
