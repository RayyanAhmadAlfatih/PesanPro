import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  attemptUpdateMany: vi.fn(),
  broadcastUpdateMany: vi.fn(),
  transaction: vi.fn(),
  settle: vi.fn(),
  webhook: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    $transaction: mocks.transaction,
    messageJob: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("./message-job-service", () => ({
  settleMessageQuota: mocks.settle,
}));

vi.mock("./webhook-outbox", () => ({
  createWebhookOutboxEvent: mocks.webhook,
}));

import {
  claimNextMessageJob,
  heartbeatMessageJob,
  recoverMessageJobsForWorker,
} from "./message-queue";

const exhaustedJob = {
  id: "job-1",
  tenantId: "tenant-1",
  requestedById: "user-1",
  sessionId: "session-db-1",
  recipient: "628123456789",
  whatsappMessageId: null,
  quotaReservationKey: "message-job:test:key",
  status: "PROCESSING",
  attempts: 5,
  maxAttempts: 5,
  lockedBy: "old-worker:claim",
  leaseExpiresAt: new Date("2026-09-28T00:00:00.000Z"),
  session: { sessionId: "device-1" },
};

describe("message queue stale-lease exhaustion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settle.mockResolvedValue(undefined);
    mocks.webhook.mockResolvedValue(undefined);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.executeRaw.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.attemptUpdateMany.mockResolvedValue({ count: 1 });
    mocks.broadcastUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      messageJob: { updateMany: mocks.updateMany },
      messageJobAttempt: { updateMany: mocks.attemptUpdateMany },
      broadcastRecipient: { updateMany: mocks.broadcastUpdateMany },
      webhookOutboxEvent: {},
      webhookDelivery: {},
    }));
  });

  it("terminalizes an exhausted stale job and releases its reservation before claiming new work", async () => {
    mocks.queryRaw.mockResolvedValue([{ id: "job-1" }]);
    mocks.findMany.mockResolvedValue([exhaustedJob]);

    await expect(claimNextMessageJob("worker-2")).resolves.toBeNull();

    expect(mocks.settle).toHaveBeenCalledWith(exhaustedJob, "RELEASE");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "job-1", attempts: { gte: 5 } }),
      data: expect.objectContaining({
        status: "FAILED",
        deadLetteredAt: expect.any(Date),
        safeErrorCode: "MAX_ATTEMPTS_EXCEEDED",
        lockedBy: null,
      }),
    }));
    expect(mocks.attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobId: "job-1", status: "PROCESSING" },
      data: expect.objectContaining({
        status: "FAILED",
        safeErrorCode: "MAX_ATTEMPTS_EXCEEDED",
      }),
    }));

    const claimSql = mocks.executeRaw.mock.calls[0]?.[0] as { strings?: string[] };
    expect(claimSql?.strings?.join(" ")).toContain("attempts < maxAttempts");
  });

  it("does not let an expired owner extend a lost lease", async () => {
    await heartbeatMessageJob("job-1", "worker-1:claim", 30_000);

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "job-1",
        status: "PROCESSING",
        lockedBy: "worker-1:claim",
        leaseExpiresAt: { gt: expect.any(Date) },
      }),
    }));
  });

  it("terminalizes a final-attempt claim during graceful worker recovery instead of requeueing it", async () => {
    mocks.findMany.mockResolvedValue([exhaustedJob]);

    await expect(recoverMessageJobsForWorker("old-worker")).resolves.toBe(1);

    expect(mocks.settle).toHaveBeenCalledWith(exhaustedJob, "RELEASE");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "FAILED",
        safeErrorCode: "MAX_ATTEMPTS_EXCEEDED",
      }),
    }));
  });
});
