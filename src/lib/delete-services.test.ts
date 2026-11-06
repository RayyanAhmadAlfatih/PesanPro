import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    messageJob: { updateMany: vi.fn(), deleteMany: vi.fn() },
    broadcastLog: { updateMany: vi.fn(), deleteMany: vi.fn() },
  },
  prisma: {
    $transaction: vi.fn(),
    messageJob: { findFirst: vi.fn() },
    broadcastLog: { findFirst: vi.fn() },
  },
  resolveTenantId: vi.fn(),
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./billing", () => ({ resolveTenantId: mocks.resolveTenantId }));
vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { deleteMessageJob, MessageJobNotFoundError, MessageJobStateError } from "./message-job-service";
import { deleteBroadcast } from "./broadcast-service";

const actor = { id: "tenant-1", role: "USER" as const, ownerId: null };

describe("deleteMessageJob (terminal-only hard delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-1");
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.tx));
  });

  it("deletes a terminal job and releases its media reference in one transaction", async () => {
    mocks.tx.messageJob.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteMessageJob(actor, "job-1")).resolves.toEqual({ id: "job-1", deleted: true });

    expect(mocks.tx.messageJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"] } }),
      data: { mediaId: null },
    }));
    expect(mocks.tx.messageJob.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "job-1", tenantId: "tenant-1" }),
    }));
  });

  it("refuses to delete a QUEUED job (cancel is the only transition)", async () => {
    mocks.tx.messageJob.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.messageJob.findFirst.mockResolvedValue({ status: "QUEUED" });

    // The status filter inside the transaction makes the delete a no-op; the
    // row must still exist afterwards and surface as a 409 state error.
    await expect(deleteMessageJob(actor, "job-2")).rejects.toBeInstanceOf(MessageJobStateError);
    await expect(deleteMessageJob(actor, "job-2")).rejects.toMatchObject({ status: 409 });
    expect(mocks.tx.messageJob.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"] } }),
    }));
  });

  it("reports 404 when the job does not exist in this tenant", async () => {
    mocks.tx.messageJob.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.messageJob.findFirst.mockResolvedValue(null);

    await expect(deleteMessageJob(actor, "job-3")).rejects.toBeInstanceOf(MessageJobNotFoundError);
  });
});

describe("deleteBroadcast (terminal-only hard delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-1");
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.tx));
  });

  it("deletes a COMPLETED broadcast and its recipient rows", async () => {
    mocks.tx.broadcastLog.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteBroadcast(actor, "bc-1")).resolves.toEqual({ id: "bc-1", deleted: true });

    expect(mocks.tx.broadcastLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["COMPLETED", "CANCELLED"] } }),
      data: { mediaId: null },
    }));
    expect(mocks.tx.broadcastLog.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "bc-1", tenantId: "tenant-1" }),
    }));
  });

  it("refuses to delete a RUNNING broadcast", async () => {
    mocks.tx.broadcastLog.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.broadcastLog.findFirst.mockResolvedValue({ status: "RUNNING" });

    await expect(deleteBroadcast(actor, "bc-2")).rejects.toMatchObject({
      code: "INVALID_BROADCAST_STATE",
      status: 409,
    });
  });

  it("reports 404 when the broadcast does not exist in this tenant", async () => {
    mocks.tx.broadcastLog.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.broadcastLog.findFirst.mockResolvedValue(null);

    await expect(deleteBroadcast(actor, "bc-3")).rejects.toMatchObject({ code: "BROADCAST_NOT_FOUND" });
  });
});
