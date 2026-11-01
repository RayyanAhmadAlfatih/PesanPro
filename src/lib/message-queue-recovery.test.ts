import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  attemptUpdateMany: vi.fn(),
  jobUpdateMany: vi.fn(),
  recipientUpdateMany: vi.fn(),
  deliveryUpsert: vi.fn(),
  outboxEvent: vi.fn(),
  settleQuota: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    messageJob: { findMany: mocks.findMany, updateMany: mocks.jobUpdateMany },
    messageJobAttempt: { updateMany: mocks.attemptUpdateMany },
    broadcastRecipient: { updateMany: mocks.recipientUpdateMany },
    messageDeliveryEvent: { upsert: mocks.deliveryUpsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock("./message-job-service", () => ({ settleMessageQuota: mocks.settleQuota }));
vi.mock("./webhook-outbox", () => ({ createWebhookOutboxEvent: mocks.outboxEvent }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { recoverMessageJobsForWorker } from "./message-queue";

type ClaimRow = {
  id: string;
  attempts: number;
  maxAttempts: number;
  requestedById: string;
  quotaReservationKey: string;
  tenantId: string;
  sessionId: number;
  recipient: string;
  whatsappMessageId: string | null;
  session: { sessionId: string };
};

function claim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: "job-1",
    attempts: 1,
    maxAttempts: 3,
    requestedById: "user-1",
    quotaReservationKey: "res-1",
    tenantId: "user-1",
    sessionId: 11,
    recipient: "628123456789@s.whatsapp.net",
    whatsappMessageId: "wa-1",
    session: { sessionId: "device-1" },
    ...overrides,
  };
}

describe("recoverMessageJobsForWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attemptUpdateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.recipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.settleQuota.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => unknown) =>
      operation({
        messageJobAttempt: { updateMany: mocks.attemptUpdateMany },
        messageJob: { updateMany: mocks.jobUpdateMany },
        broadcastRecipient: { updateMany: mocks.recipientUpdateMany },
        messageDeliveryEvent: { upsert: mocks.deliveryUpsert },
      }),
    );
  });

  it("requeues jobs that still have attempts left", async () => {
    mocks.findMany.mockResolvedValue([claim({ attempts: 1, maxAttempts: 3 })]);

    await expect(recoverMessageJobsForWorker("worker-a")).resolves.toBe(1);

    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["job-1"] } }),
        data: expect.objectContaining({ status: "QUEUED" }),
      }),
    );
    expect(mocks.settleQuota).not.toHaveBeenCalled();
  });

  it("dead-letters exhausted jobs instead of requeueing them into a stuck state", async () => {
    const exhausted = claim({ id: "job-x", attempts: 3, maxAttempts: 3 });
    mocks.findMany.mockResolvedValue([exhausted]);

    await expect(recoverMessageJobsForWorker("worker-a")).resolves.toBe(1);

    // Never requeued: the claim query refuses attempts >= maxAttempts, so a
    // requeued exhausted job would sit in QUEUED forever holding its quota.
    expect(mocks.jobUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "QUEUED" }) }),
    );
    expect(mocks.settleQuota).toHaveBeenCalledWith(exhausted, "RELEASE");
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-x", status: "PROCESSING" }),
        data: expect.objectContaining({ status: "FAILED", deadLetteredAt: expect.any(Date) }),
      }),
    );
    expect(mocks.recipientUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageJobId: "job-x", status: "ENQUEUED" },
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(mocks.deliveryUpsert).toHaveBeenCalled();
    expect(mocks.outboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "message.status", eventKey: "message-job:job-x:FAILED" }),
    );
  });

  it("handles a mixed batch, recovering one and dead-lettering the other", async () => {
    mocks.findMany.mockResolvedValue([
      claim({ id: "job-ok", attempts: 1, maxAttempts: 3 }),
      claim({ id: "job-dead", attempts: 2, maxAttempts: 2 }),
    ]);

    await expect(recoverMessageJobsForWorker("worker-a")).resolves.toBe(2);

    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["job-ok"] } }),
        data: expect.objectContaining({ status: "QUEUED" }),
      }),
    );
    expect(mocks.settleQuota).toHaveBeenCalledTimes(1);
    expect(mocks.settleQuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-dead" }),
      "RELEASE",
    );
  });
});
