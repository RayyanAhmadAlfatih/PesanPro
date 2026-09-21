import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueMessage: vi.fn(),
  requireEntitlement: vi.fn(),
  broadcastUpdateMany: vi.fn(),
  recipientFindFirst: vi.fn(),
  recipientUpdateMany: vi.fn(),
  recipientCount: vi.fn(),
  suppressionFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  webhookOutboxCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./message-job-service", () => ({ enqueueMessage: mocks.enqueueMessage }));
vi.mock("./billing", () => ({ requireEntitlement: mocks.requireEntitlement }));
vi.mock("./prisma", () => ({
  prisma: {
    broadcastLog: { updateMany: mocks.broadcastUpdateMany },
    broadcastRecipient: {
      findFirst: mocks.recipientFindFirst,
      updateMany: mocks.recipientUpdateMany,
      count: mocks.recipientCount,
    },
    suppressionEntry: { findFirst: mocks.suppressionFindFirst },
    contact: { findFirst: mocks.contactFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { executeClaimedBroadcast, type ClaimedBroadcast } from "./broadcast-queue";

function recipient() {
  const now = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: "recipient-1",
    broadcastLogId: "broadcast-1",
    messageJobId: null,
    position: 0,
    jid: "628123456789@s.whatsapp.net",
    renderedMessage: null,
    status: "PENDING" as const,
    attempt: 0,
    safeErrorCode: null,
    safeErrorMessage: null,
    enqueuedAt: null,
    skippedAt: null,
    sentAt: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function claim(): ClaimedBroadcast {
  const now = new Date("2026-09-01T00:00:00.000Z");
  return {
    claimToken: "worker-a:claim-a",
    leaseMs: 30_000,
    broadcast: {
      id: "broadcast-1",
      tenantId: "owner-1",
      createdById: "owner-1",
      sessionDbId: "session-db-1",
      campaignId: null,
      sessionId: "device-1",
      createKey: "request-1",
      requestHash: "hash-1",
      name: "Campaign",
      message: "{Halo|Hai} pelanggan",
      mediaId: null,
      mediaType: null,
      total: 1,
      enqueued: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      status: "RUNNING",
      delayMinMs: 2_000,
      delayMaxMs: 3_000,
      jitterSeed: "stable-seed",
      requireOptIn: false,
      lockedBy: "worker-a:claim-a",
      leaseExpiresAt: new Date("2026-09-01T00:00:30.000Z"),
      heartbeatAt: now,
      nextDispatchAt: now,
      safeErrorCode: null,
      safeErrorMessage: null,
      startedAt: now,
      pausedAt: null,
      completedAt: null,
      cancelledAt: null,
      failedAt: null,
      createdAt: now,
      updatedAt: now,
      session: { id: "session-db-1", sessionId: "device-1" },
      creator: { id: "user-1", role: "USER", ownerId: null },
      media: null,
    },
  };
}

describe("durable broadcast queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.broadcastUpdateMany.mockResolvedValue({ count: 1 });
    mocks.recipientFindFirst.mockResolvedValue(recipient());
    mocks.recipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.recipientCount.mockResolvedValue(0);
    mocks.suppressionFindFirst.mockResolvedValue(null);
    mocks.contactFindFirst.mockResolvedValue(null);
    mocks.requireEntitlement.mockResolvedValue({});
    mocks.enqueueMessage.mockResolvedValue({ job: { id: "message-job-1" }, idempotent: false });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) => operation({
      broadcastLog: { updateMany: mocks.broadcastUpdateMany },
      broadcastRecipient: { updateMany: mocks.recipientUpdateMany, count: mocks.recipientCount },
      webhookOutboxEvent: { create: mocks.webhookOutboxCreate },
    }));
  });

  it("enqueues one recipient with the durable recipient ID as idempotency key", async () => {
    const result = await executeClaimedBroadcast(claim());

    expect(result).toMatchObject({ action: "ENQUEUED", finalized: true });
    expect(mocks.enqueueMessage).toHaveBeenCalledWith(expect.objectContaining({
      operation: "broadcast.execute",
      idempotencyKey: "recipient-1",
      sessionPublicId: "device-1",
      recipient: "628123456789@s.whatsapp.net",
    }));
    expect(mocks.recipientUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "recipient-1", status: "PENDING" }),
      data: expect.objectContaining({ status: "ENQUEUED", messageJobId: "message-job-1" }),
    }));
    expect(mocks.webhookOutboxCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "broadcast.status", tenantId: "owner-1" }) }));
  });

  it("does not enqueue when pause or another worker invalidates the lease", async () => {
    mocks.broadcastUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(executeClaimedBroadcast(claim())).resolves.toEqual({ action: "CLAIM_LOST", finalized: false });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
  });

  it("rechecks suppression immediately before enqueue", async () => {
    mocks.suppressionFindFirst.mockResolvedValue({ id: "suppression-1" });

    const result = await executeClaimedBroadcast(claim());

    expect(result).toEqual({ action: "SKIPPED", finalized: true });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.recipientUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SKIPPED", safeErrorCode: "RECIPIENT_SUPPRESSED" }),
    }));
  });

  it("recovers a crash after enqueue without creating a second message job", async () => {
    mocks.transaction.mockResolvedValueOnce(false);
    const first = await executeClaimedBroadcast(claim());
    expect(first).toMatchObject({ action: "ENQUEUED", finalized: false });

    mocks.enqueueMessage.mockResolvedValueOnce({ job: { id: "message-job-1" }, idempotent: true });
    const recovered = await executeClaimedBroadcast(claim());

    expect(recovered).toMatchObject({ action: "ENQUEUED", idempotent: true, finalized: true });
    expect(mocks.enqueueMessage).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueMessage.mock.calls[0][0].idempotencyKey).toBe(mocks.enqueueMessage.mock.calls[1][0].idempotencyKey);
  });
});
