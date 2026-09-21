import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignUpdateMany: vi.fn(),
  campaignUpdate: vi.fn(),
  broadcastFindUnique: vi.fn(),
  broadcastCreate: vi.fn(),
  campaignRecipientUpdateMany: vi.fn(),
  suppressionFindMany: vi.fn(),
  contactFindMany: vi.fn(),
  transaction: vi.fn(),
  requireEntitlement: vi.fn(),
}));

vi.mock("./billing", () => ({
  requireEntitlement: mocks.requireEntitlement,
  EntitlementDeniedError: class EntitlementDeniedError extends Error {},
  SubscriptionInactiveError: class SubscriptionInactiveError extends Error {},
}));

vi.mock("./prisma", () => ({
  prisma: {
    campaign: { updateMany: mocks.campaignUpdateMany },
    broadcastLog: { findUnique: mocks.broadcastFindUnique },
    suppressionEntry: { findMany: mocks.suppressionFindMany },
    contact: { findMany: mocks.contactFindMany },
    $transaction: mocks.transaction,
  },
}));

import { EntitlementDeniedError } from "./billing";
import { failClaimedCampaign, materializeClaimedCampaign, type ClaimedCampaign } from "./campaign-queue";

function claim(input: { primaryStatus?: string; fallbackStatus?: string | null; requireOptIn?: boolean } = {}) {
  const now = new Date("2026-09-02T00:00:00.000Z");
  return {
    claimToken: "worker-a:claim-a",
    leaseMs: 30_000,
    campaign: {
      id: "campaign-1",
      tenantId: "owner-1",
      createdById: "owner-1",
      currentVersion: 1,
      name: "Safe campaign",
      status: "QUEUED",
      materializeAttempts: 1,
      startedAt: null,
      creator: { id: "owner-1" },
      versions: [{
        id: "version-1",
        version: 1,
        primarySessionId: "session-primary",
        fallbackSessionId: input.fallbackStatus === null ? null : "session-fallback",
        fallbackPolicy: input.fallbackStatus === null ? "PRIMARY_ONLY" : "USE_FALLBACK",
        mediaId: null,
        message: "Hello",
        delayMinMs: 2_000,
        delayMaxMs: 3_000,
        requireOptIn: input.requireOptIn ?? false,
        configurationHash: "stable-hash",
        primarySession: { id: "session-primary", sessionId: "primary-public", status: input.primaryStatus ?? "CONNECTED" },
        fallbackSession: input.fallbackStatus === null ? null : { id: "session-fallback", sessionId: "fallback-public", status: input.fallbackStatus ?? "CONNECTED" },
        media: null,
        recipients: [
          { id: "snapshot-1", jid: "628111111111@s.whatsapp.net", position: 0 },
          { id: "snapshot-2", jid: "628222222222@s.whatsapp.net", position: 1 },
        ],
      }],
      scheduledAt: now,
      createdAt: now,
      updatedAt: now,
    },
  } as unknown as ClaimedCampaign;
}

describe("durable campaign handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.broadcastFindUnique.mockResolvedValue(null);
    mocks.requireEntitlement.mockResolvedValue({});
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
    mocks.suppressionFindMany.mockResolvedValue([]);
    mocks.contactFindMany.mockResolvedValue([]);
    mocks.broadcastCreate.mockResolvedValue({ id: "broadcast-1", status: "QUEUED" });
    mocks.campaignRecipientUpdateMany.mockResolvedValue({ count: 2 });
    mocks.campaignUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) => operation({
      campaign: { updateMany: mocks.campaignUpdateMany, update: mocks.campaignUpdate },
      broadcastLog: { create: mocks.broadcastCreate },
      campaignRecipient: { updateMany: mocks.campaignRecipientUpdateMany },
    }));
  });

  it("recovers an already committed broadcast without creating another one", async () => {
    mocks.broadcastFindUnique.mockResolvedValue({ id: "broadcast-existing", status: "RUNNING" });
    await expect(materializeClaimedCampaign(claim())).resolves.toEqual({ action: "RECOVERED", broadcastId: "broadcast-existing" });
    expect(mocks.broadcastCreate).not.toHaveBeenCalled();
    expect(mocks.campaignUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RUNNING", lockedBy: null }) }));
  });

  it("uses a connected fallback only when the primary is unavailable", async () => {
    const result = await materializeClaimedCampaign(claim({ primaryStatus: "STOPPED", fallbackStatus: "CONNECTED" }));
    expect(result).toEqual({ action: "HANDED_OFF", broadcastId: "broadcast-1" });
    expect(mocks.broadcastCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sessionDbId: "session-fallback", sessionId: "fallback-public", campaignId: "campaign-1" }),
    }));
  });

  it("marks current unsubscribe and opt-in failures before the broadcast worker starts", async () => {
    mocks.suppressionFindMany.mockResolvedValue([{ jid: "628111111111@s.whatsapp.net", reason: "UNSUBSCRIBE" }]);
    mocks.contactFindMany.mockResolvedValue([]);
    await materializeClaimedCampaign(claim({ requireOptIn: true }));
    const recipients = mocks.broadcastCreate.mock.calls[0][0].data.recipients.create;
    expect(recipients).toEqual([
      expect.objectContaining({ status: "SKIPPED", safeErrorCode: "RECIPIENT_UNSUBSCRIBED" }),
      expect.objectContaining({ status: "SKIPPED", safeErrorCode: "OPT_IN_REQUIRED" }),
    ]);
    expect(mocks.campaignUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", skipped: 2, unsubscribed: 1 }) }));
  });

  it("fails closed without retry when campaign entitlement is no longer active", async () => {
    const result = await failClaimedCampaign(claim(), new EntitlementDeniedError("CAMPAIGNS_MONTHLY"));
    expect(result).toEqual({ retrying: false, code: "ENTITLEMENT_DENIED" });
    expect(mocks.campaignUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED", safeErrorCode: "ENTITLEMENT_DENIED" }),
    }));
  });
});
