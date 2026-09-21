import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueMessage: vi.fn(),
  requireEntitlement: vi.fn(),
  executionUpdate: vi.fn(),
  executionUpdateMany: vi.fn(),
  scheduleUpdateMany: vi.fn(),
  webhookOutboxCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./message-job-service", () => ({ enqueueMessage: mocks.enqueueMessage }));
vi.mock("./billing", () => ({ requireEntitlement: mocks.requireEntitlement }));
vi.mock("./prisma", () => ({
  prisma: {
    scheduleExecution: { update: mocks.executionUpdate, updateMany: mocks.executionUpdateMany },
    scheduledMessage: { updateMany: mocks.scheduleUpdateMany },
    $transaction: mocks.transaction,
  },
}));

import type { ClaimedSchedule } from "./schedule-queue";
import { executeClaimedSchedule } from "./schedule-queue";

function claim(overrides: {
  executionStatus?: "CLAIMED" | "ENQUEUED" | "SKIPPED" | "FAILED";
  policy?: "SEND_LATE" | "SKIP" | "CANCEL";
  scheduledFor?: Date;
  kind?: "ONE_TIME" | "RECURRING";
} = {}) {
  const scheduledFor = overrides.scheduledFor ?? new Date("2026-08-31T01:00:00.000Z");
  return {
    claimToken: "worker-a:claim-a",
    leaseMs: 30_000,
    execution: {
      id: "execution-1",
      scheduleId: "schedule-1",
      messageJobId: overrides.executionStatus === "ENQUEUED" ? "job-1" : null,
      occurrenceKey: "v1:2026-08-31T01:00:00.000Z",
      scheduledFor,
      status: overrides.executionStatus ?? "CLAIMED",
      attempt: 1,
      workerId: "worker-a",
      claimToken: "worker-a:claim-a",
      safeErrorCode: null,
      safeErrorMessage: null,
      startedAt: scheduledFor,
      enqueuedAt: null,
      finishedAt: null,
      createdAt: scheduledFor,
      updatedAt: scheduledFor,
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
      nextRunAt: scheduledFor,
      startAt: scheduledFor,
      timezone: "Asia/Jakarta",
      kind: overrides.kind ?? "ONE_TIME",
      cronExpression: overrides.kind === "RECURRING" ? "0 9 * * *" : null,
      recurrenceRule: null,
      missedRunPolicy: overrides.policy ?? "SEND_LATE",
      misfireGraceSeconds: 300,
      status: "ACTIVE",
      version: 1,
      lockedBy: "worker-a:claim-a",
      leaseExpiresAt: new Date("2026-08-31T01:01:00.000Z"),
      heartbeatAt: scheduledFor,
      lastRunAt: null,
      completedAt: null,
      cancelledAt: null,
      safeErrorCode: null,
      safeErrorMessage: null,
      createdAt: scheduledFor,
      updatedAt: scheduledFor,
      session: { sessionId: "wa-device-1", user: { id: "user-1", role: "USER", ownerId: null } },
      media: null,
    },
  } as ClaimedSchedule;
}

describe("durable schedule execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEntitlement.mockResolvedValue({});
    mocks.enqueueMessage.mockResolvedValue({ job: { id: "job-1" } });
    mocks.executionUpdate.mockResolvedValue({});
    mocks.executionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.scheduleUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return operation({
          scheduleExecution: { updateMany: mocks.executionUpdateMany },
          scheduledMessage: { updateMany: mocks.scheduleUpdateMany },
          webhookOutboxEvent: { create: mocks.webhookOutboxCreate },
        });
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("hands a due occurrence to the durable message queue with its execution ID as idempotency key", async () => {
    const current = claim();
    const result = await executeClaimedSchedule(current, new Date("2026-08-31T01:02:00.000Z"));

    expect(result).toEqual({ action: "ENQUEUED", finalized: true });
    expect(mocks.enqueueMessage).toHaveBeenCalledWith(expect.objectContaining({
      operation: "schedule.execute",
      idempotencyKey: "execution-1",
      sessionPublicId: "wa-device-1",
    }));
    expect(mocks.executionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ENQUEUED", messageJobId: "job-1" }),
    }));
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lockedBy: "worker-a:claim-a" }),
      data: expect.objectContaining({ status: "COMPLETED", lockedBy: null }),
    }));
    expect(mocks.webhookOutboxCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "schedule.status", tenantId: "user-1" }) }));
  });

  it("finalizes a recovered ENQUEUED occurrence without enqueueing it twice", async () => {
    const result = await executeClaimedSchedule(claim({ executionStatus: "ENQUEUED" }));

    expect(result).toEqual({ action: "ENQUEUED", finalized: true });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("does nothing after another worker takes over the schedule lease", async () => {
    mocks.scheduleUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await executeClaimedSchedule(claim());

    expect(result).toEqual({ action: "CLAIM_LOST", finalized: false });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.executionUpdateMany).not.toHaveBeenCalled();
  });

  it("skips a missed occurrence without creating a message job", async () => {
    const current = claim({ policy: "SKIP", scheduledFor: new Date("2026-08-31T00:00:00.000Z") });
    const result = await executeClaimedSchedule(current, new Date("2026-08-31T01:00:00.000Z"));

    expect(result).toEqual({ action: "SKIPPED", finalized: true });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.executionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }));
  });

  it("cancels a missed schedule only through its current claim token", async () => {
    const current = claim({ policy: "CANCEL", scheduledFor: new Date("2026-08-31T00:00:00.000Z") });
    const result = await executeClaimedSchedule(current, new Date("2026-08-31T01:00:00.000Z"));

    expect(result).toEqual({ action: "CANCELLED", finalized: true });
    expect(mocks.enqueueMessage).not.toHaveBeenCalled();
    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "schedule-1", status: "ACTIVE", lockedBy: "worker-a:claim-a" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    }));
    expect(mocks.executionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "execution-1", claimToken: "worker-a:claim-a" },
    }));
  });
});
