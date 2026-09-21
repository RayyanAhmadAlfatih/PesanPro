import { setTimeout as sleep } from "node:timers/promises";
import {
  claimNextDueCampaign,
  DEFAULT_CAMPAIGN_LEASE_MS,
  failClaimedCampaign,
  heartbeatCampaign,
  materializeClaimedCampaign,
  reconcileActiveCampaigns,
  recoverCampaignsForWorker,
  type ClaimedCampaign,
} from "@/lib/campaign-queue";
import { logger } from "@/lib/logger";
import type { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

export class CampaignWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: { workerId: string; pollMs?: number; leaseMs?: number; healthReporter?: Pick<RuntimeHeartbeatReporter, "markHealthy" | "reportError"> }) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.run();
    logger.info("CampaignWorker", `Started ${this.options.workerId}`);
  }

  async stop() {
    if (!this.running && !this.loopPromise) return;
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
    const recovered = await recoverCampaignsForWorker(this.options.workerId);
    logger.info("CampaignWorker", `Stopped ${this.options.workerId}; recovered ${recovered} claim(s)`);
  }

  private async run() {
    const pollMs = this.options.pollMs ?? 1000;
    const leaseMs = this.options.leaseMs ?? DEFAULT_CAMPAIGN_LEASE_MS;
    let reconcileTick = 0;
    while (this.running) {
      let claim: ClaimedCampaign | null = null;
      try {
        claim = await claimNextDueCampaign(this.options.workerId, leaseMs);
        await this.options.healthReporter?.markHealthy();
        if (!claim) {
          if (reconcileTick % 5 === 0) await reconcileActiveCampaigns();
          reconcileTick += 1;
          await sleep(pollMs);
          continue;
        }
        const heartbeat = setInterval(() => {
          void heartbeatCampaign(claim!.campaign.id, claim!.claimToken, leaseMs)
            .catch((error) => logger.error("CampaignWorker", "Heartbeat failed", error));
        }, Math.max(1000, Math.floor(leaseMs / 3)));
        heartbeat.unref?.();
        try {
          const result = await materializeClaimedCampaign(claim);
          logger.info("CampaignWorker", `${claim.campaign.id} ${result.action}`);
        } catch (error) {
          const result = await failClaimedCampaign(claim, error);
          logger.warn("CampaignWorker", `${claim.campaign.id} ${result.retrying ? "will retry" : "failed"}: ${result.code}`);
        } finally {
          clearInterval(heartbeat);
        }
        await reconcileActiveCampaigns(5);
      } catch (error) {
        await this.options.healthReporter?.reportError("CAMPAIGN_QUEUE_POLL_FAILED", error);
        logger.error("CampaignWorker", claim ? `Unexpected error for ${claim.campaign.id}` : "Polling failed", error);
        await sleep(pollMs);
      }
    }
  }
}
