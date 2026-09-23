import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueMessage: vi.fn(),
  requireEntitlement: vi.fn(),
  triggerUpdateMany: vi.fn(),
  ruleFindMany: vi.fn(),
  isRecipientSuppressed: vi.fn(),
}));

vi.mock("./message-job-service", () => ({ enqueueMessage: mocks.enqueueMessage }));
vi.mock("./billing", () => {
  class EntitlementDeniedError extends Error {}
  class SubscriptionInactiveError extends Error {}
  return { EntitlementDeniedError, SubscriptionInactiveError, requireEntitlement: mocks.requireEntitlement };
});
vi.mock("./usage", () => ({ QuotaExceededError: class QuotaExceededError extends Error {} }));
vi.mock("./suppression", () => ({ isRecipientSuppressed: mocks.isRecipientSuppressed }));
vi.mock("./prisma", () => ({
  prisma: {
    autoReplyTriggerLog: { updateMany: mocks.triggerUpdateMany },
    autoReply: { findMany: mocks.ruleFindMany },
  },
}));

import { EntitlementDeniedError } from "./billing";
import { failClaimedAutoReply, processClaimedAutoReply, type ClaimedAutoReplyTrigger } from "./autoreply-queue";

function claim(overrides: { snapshot?: boolean; botEnabled?: boolean; attempts?: number } = {}) {
  const now = new Date("2026-09-03T00:00:00Z");
  return {
    claimToken: "worker-a:claim-a",
    leaseMs: 30_000,
    trigger: {
      id: "trigger-1",
      tenantId: "owner-1",
      sessionId: "session-db-1",
      ruleId: overrides.snapshot === false ? null : "rule-1",
      messageJobId: null,
      eventKey: "event-key",
      sourceMessageId: "wa-message-1",
      sourceText: "halo",
      recipientJid: "628123456789@s.whatsapp.net",
      senderJid: "628123456789@s.whatsapp.net",
      isGroup: false,
      ruleVersion: overrides.snapshot === false ? null : 2,
      chainDepth: 1,
      snapshotResponse: overrides.snapshot === false ? null : "Halo juga",
      snapshotMediaId: null,
      snapshotMessageType: overrides.snapshot === false ? null : "TEXT",
      status: "PROCESSING",
      availableAt: now,
      reasonCode: null,
      safeErrorMessage: null,
      attempts: overrides.attempts ?? 1,
      lockedBy: "worker-a:claim-a",
      leaseExpiresAt: new Date("2026-09-03T00:00:30Z"),
      heartbeatAt: now,
      enqueuedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
      session: {
        id: "session-db-1",
        userId: "owner-1",
        name: "Device",
        sessionId: "device-1",
        status: "CONNECTED",
        qr: null,
        config: null,
        createdAt: now,
        updatedAt: now,
        user: { id: "user-1", role: "USER", ownerId: null },
        botConfig: overrides.botEnabled === false ? { enabled: false, autoReplyMode: "ALL", autoReplyAllowedJids: null, autoReplyBlockedJids: null } : null,
      },
      rule: null,
    },
  } as unknown as ClaimedAutoReplyTrigger;
}

describe("durable auto-reply queue handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.triggerUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enqueueMessage.mockResolvedValue({ job: { id: "message-job-1" }, idempotent: false });
    mocks.requireEntitlement.mockResolvedValue({});
    mocks.isRecipientSuppressed.mockResolvedValue(false);
  });

  it("replays a durable snapshot with trigger ID as the queue idempotency key", async () => {
    const result = await processClaimedAutoReply(claim());
    expect(result).toEqual({ action: "ENQUEUED", messageJobId: "message-job-1" });
    expect(mocks.enqueueMessage).toHaveBeenCalledWith(expect.objectContaining({
      operation: "autoreply.execute",
      idempotencyKey: "trigger-1",
      quotedMessageId: "wa-message-1",
      priority: 25,
    }));
  });

  it("does not enqueue after another worker takes the lease", async () => {
    mocks.triggerUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(processClaimedAutoReply(claim())).resolves.toEqual({ action: "CLAIM_LOST", messageJobId: null });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("recovers a crash after enqueue without changing the idempotency key", async () => {
    mocks.triggerUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    expect(await processClaimedAutoReply(claim())).toEqual({ action: "CLAIM_LOST", messageJobId: "message-job-1" });
    mocks.enqueueMessage.mockResolvedValueOnce({ job: { id: "message-job-1" }, idempotent: true });
    expect(await processClaimedAutoReply(claim())).toEqual({ action: "ENQUEUED", messageJobId: "message-job-1" });
    expect(mocks.enqueueMessage).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueMessage.mock.calls[0][0].idempotencyKey).toBe(mocks.enqueueMessage.mock.calls[1][0].idempotencyKey);
  });

  it("records global disable as SKIPPED without queue handoff", async () => {
    expect(await processClaimedAutoReply(claim({ snapshot: false, botEnabled: false }))).toMatchObject({ action: "SKIPPED", reasonCode: "BOT_DISABLED" });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.triggerUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceText: null, senderJid: "[redacted]" }),
    }));
  });

  it("treats entitlement denial as a terminal skip rather than a retry storm", async () => {
    const current = claim({ attempts: 1 });
    const result = await failClaimedAutoReply(current, new EntitlementDeniedError("AUTOREPLY_RULES"));
    expect(result).toEqual({ retrying: false, code: "ENTITLEMENT_DENIED" });
    expect(mocks.triggerUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SKIPPED", sourceText: null, senderJid: "[redacted]" }),
    }));
  });
});
