import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "@/lib/logger";
import type { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";
import {
  claimNextWebhookDelivery,
  claimNextWebhookEvent,
  DEFAULT_WEBHOOK_LEASE_MS,
  executeClaimedWebhookDelivery,
  failClaimedWebhookDelivery,
  failClaimedWebhookEvent,
  heartbeatWebhookDelivery,
  heartbeatWebhookEvent,
  materializeClaimedWebhookEvent,
  recoverWebhookClaimsForWorker,
  type ClaimedWebhookDelivery,
  type ClaimedWebhookEvent,
} from "@/lib/webhook-outbox";

export class WebhookWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: { workerId: string; pollMs?: number; leaseMs?: number; healthReporter?: Pick<RuntimeHeartbeatReporter, "markHealthy" | "reportError"> }) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("WebhookWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverWebhookClaimsForWorker(this.options.workerId);
    logger.info("WebhookWorker", `Stopped ${this.options.workerId}; recovered ${recovered.events} event(s) and ${recovered.deliveries} delivery claim(s)`);
  }

  private async processEvent(claim: ClaimedWebhookEvent, leaseMs: number) {
    const heartbeat = setInterval(() => {
      void heartbeatWebhookEvent(claim.event.id, claim.claimToken, leaseMs)
        .catch((error) => logger.error("WebhookWorker", "Event heartbeat failed", error));
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    heartbeat.unref?.();
    try {
      const result = await materializeClaimedWebhookEvent(claim);
      logger.info("WebhookWorker", `Event ${claim.event.id} ${result.action}; ${result.deliveries} delivery target(s)`);
    } catch (error) {
      const result = await failClaimedWebhookEvent(claim, error);
      logger.warn("WebhookWorker", `Event ${claim.event.id} ${result.retrying ? "will retry" : "dead-lettered"}`);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async processDelivery(claim: ClaimedWebhookDelivery, leaseMs: number) {
    const heartbeat = setInterval(() => {
      void heartbeatWebhookDelivery(claim.delivery.id, claim.claimToken, leaseMs)
        .catch((error) => logger.error("WebhookWorker", "Delivery heartbeat failed", error));
    }, Math.max(1000, Math.floor(leaseMs / 3)));
    heartbeat.unref?.();
    try {
      const result = await executeClaimedWebhookDelivery(claim);
      logger.info("WebhookWorker", `Delivery ${claim.delivery.id} ${result.action}`);
    } catch (error) {
      const result = await failClaimedWebhookDelivery(claim, error);
      logger.warn("WebhookWorker", `Delivery ${claim.delivery.id} ${result.retrying ? "will retry" : "dead-lettered"}: ${result.code}`);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 1000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_WEBHOOK_LEASE_MS;
    while (this.running) {
      try {
        const event = await claimNextWebhookEvent(this.options.workerId, leaseMs);
        await this.options.healthReporter?.markHealthy();
        if (event) await this.processEvent(event, leaseMs);
        const delivery = await claimNextWebhookDelivery(this.options.workerId, leaseMs);
        if (delivery) await this.processDelivery(delivery, leaseMs);
        if (!event && !delivery) await sleep(pollMs);
      } catch (error) {
        await this.options.healthReporter?.reportError("WEBHOOK_QUEUE_POLL_FAILED", error);
        logger.error("WebhookWorker", "Polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
