import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executionUpdateMany: vi.fn(),
  scheduleUpdateMany: vi.fn(),
  webhookCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./message-job-service", () => ({ enqueueMessage: vi.fn() }));
vi.mock("./billing", () => ({ requireEntitlement: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: {
    scheduleExecution: { updateMany: mocks.executionUpdateMany },
    scheduledMessage: { updateMany: mocks.scheduleUpdateMany },
    $transaction: mocks.transaction,
  },
}));

import { failClaimedSchedule, MAX_SCHEDULE_ATTEMPTS, type ClaimedSchedule } from "./schedule-queue";

function claim(attempt: number): ClaimedSchedule {
  const when = new Date("2026-08-31T01:00:00.000Z");
  return {
    claimToken: "worker-a:claim-a",
    leaseMs: 30_000,
    execution: {
      id: "execution-1",
      scheduleId: "schedule-1",
      messageJobId: null,
      occurrenceKey: "v1:2026-08-31T01:00:00.000Z",
      scheduledFor: when,
      status: "CLAIMED",
      attempt,
      workerId: "worker-a",
      claimToken: "worker-a:claim-a",
      safeErrorCode: null,
      safeErrorMessage: null,
      startedAt: when,
      enqueuedAt: null,
      finishedAt: null,
      createdAt: when,
      updatedAt: when,
    },
    schedule: {
      id: "schedule-1",
      createdById: "owner-1",
      sessionId: "session-db-1",
      mediaId: null,
      jid: "628123456789@s.whatsapp.net",
      content: "Scheduled hello",
      mediaUrl: null,
      mediaType: null,
      nextRunAt: when,
      startAt: when,
      timezone: "Asia/Jakarta",
      kind: "ONE_TIME",
      cronExpression: null,
      recurrenceRule: null,
      missedRunPolicy: "SEND_LATE",
      misfireGraceSeconds: 300,
      status: "ACTIVE",
      version: 1,
      lockedBy: "worker-a:claim-a",
      leaseExpiresAt: when,
      heartbeatAt: when,
      lastRunAt: null,
      completedAt: null,
      cancelledAt: null,
      safeErrorCode: null,
      safeErrorMessage: null,
      createdAt: when,
      updatedAt: when,
      session: { sessionId: "wa-device-1", user: { id: "user-1", role: "USER", ownerId: null } },
      media: null,
    },
  } as unknown as ClaimedSchedule;
}

describe("durable schedule failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return operation({
          scheduleExecution: { updateMany: mocks.executionUpdateMany },
          scheduledMessage: { updateMany: mocks.scheduleUpdateMany },
          webhookOutboxEvent: { create: mocks.webhookCreate },
        });
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("defers a retryable failure with a bounded lease backoff instead of releasing the lock immediately", async () => {
    const before = Date.now();
    const result = await failClaimedSchedule(claim(1), new Error("temporary"));

    expect(result).toEqual({ retrying: true, code: "TEMPORARY_SCHEDULER_ERROR" });
    const data = mocks.scheduleUpdateMany.mock.calls[0][0].data;
    // The lock must be retained so the worker cannot re-claim the same failing
    // occurrence on the very next poll; only the lease is pushed forward.
    expect(data.lockedBy).toBeUndefined();
    expect(data.leaseExpiresAt).toBeInstanceOf(Date);
    expect(data.leaseExpiresAt.getTime()).toBeGreaterThan(before);
    expect(mocks.scheduleUpdateMany.mock.calls[0][0].where).toMatchObject({ lockedBy: "worker-a:claim-a" });
  });

  it("terminalises the occurrence once the retry budget is exhausted", async () => {
    const result = await failClaimedSchedule(claim(MAX_SCHEDULE_ATTEMPTS), new Error("temporary"));

    expect(result.retrying).toBe(false);
    expect(result.code).toBe("SCHEDULE_ATTEMPTS_EXHAUSTED");
    expect(mocks.scheduleUpdateMany.mock.calls[0][0].data).toMatchObject({ status: "FAILED", lockedBy: null });
  });

  it("does not retry a non-retryable entitlement failure", async () => {
    const error = new Error("denied");
    error.name = "EntitlementDeniedError";

    const result = await failClaimedSchedule(claim(1), error);

    expect(result.retrying).toBe(false);
    expect(mocks.scheduleUpdateMany.mock.calls[0][0].data).toMatchObject({ status: "FAILED" });
  });
});
