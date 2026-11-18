import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  type Job = {
    id: string;
    tenantId: string;
    sessionId: string;
    status: "FAILED" | "QUEUED" | "PROCESSING";
    recipient: string;
    text: string | null;
    caption: string | null;
    attempts: number;
    maxAttempts: number;
    availableAt: Date;
    idempotencyKey: string;
    apiKeyId: string | null;
    quotaReservationKey: string;
    failedAt: Date | null;
    deadLetteredAt: Date | null;
    safeErrorCode: string | null;
    safeErrorMessage: string | null;
    lastErrorAt: Date | null;
    lockedBy: string | null;
    leaseExpiresAt: Date | null;
    heartbeatAt: Date | null;
  };

  const jobs: Job[] = [];
  const sessions = new Map<string, { sessionId: string; status: string; userId: string }>();
  const audits: Array<Record<string, unknown>> = [];

  const baseJob = (overrides: Partial<Job> = {}): Job => ({
    id: "job-1",
    tenantId: "tenant-a",
    sessionId: "db-session-a",
    status: "FAILED",
    recipient: "628111111111",
    text: "Pesan yang nyangkut",
    caption: null,
    attempts: 5,
    maxAttempts: 5,
    availableAt: new Date("2026-11-18T01:00:00.000Z"),
    idempotencyKey: "idem-1",
    apiKeyId: null,
    quotaReservationKey: "message-job:send:idem-1",
    failedAt: new Date("2026-11-18T01:00:00.000Z"),
    deadLetteredAt: new Date("2026-11-18T01:00:01.000Z"),
    safeErrorCode: "ATTEMPTS_EXHAUSTED",
    safeErrorMessage: "Delivery attempts were exhausted",
    lastErrorAt: new Date("2026-11-18T01:00:01.000Z"),
    lockedBy: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    ...overrides,
  });

  const matches = (job: Job, where: Record<string, unknown>) => {
    if (where.id && job.id !== where.id) return false;
    if (where.tenantId && job.tenantId !== where.tenantId) return false;
    if (where.status && typeof where.status === "object" && "in" in where.status) {
      if (!(where.status.in as string[]).includes(job.status)) return false;
    } else if (where.status && job.status !== where.status) return false;
    const dl = where.deadLetteredAt as { not?: unknown } | undefined;
    if (dl && "not" in dl && job.deadLetteredAt === null) return false;
    return true;
  };

  const messageJob = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => jobs.filter((job) => matches(job, where)).map((job) => ({
      id: job.id,
      recipient: job.recipient,
      text: job.text,
      caption: job.caption,
      failedAt: job.failedAt,
      deadLetteredAt: job.deadLetteredAt,
      safeErrorCode: job.safeErrorCode,
    }))),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => jobs.find((job) => matches(job, where)) ?? null),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Job> }) => {
      let count = 0;
      for (const job of jobs) {
        if (matches(job, where)) { Object.assign(job, data); count += 1; }
      }
      return { count };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = jobs.length;
      for (let i = jobs.length - 1; i >= 0; i -= 1) {
        if (matches(jobs[i], where)) jobs.splice(i, 1);
      }
      return { count: before - jobs.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Job> }) => {
      const job = jobs.find((entry) => entry.id === where.id);
      if (!job) throw new Error("not found");
      Object.assign(job, data);
      return job;
    }),
  };

  return {
    jobs,
    sessions,
    audits,
    baseJob,
    messageJob,
    resolveTenantId: vi.fn(async (userId: string) => (userId === "tenant-a" ? "tenant-a" : userId === "tenant-b" ? "tenant-b" : null)),
    canAccessSession: vi.fn(async () => true),
    reserveUsage: vi.fn(async () => undefined),
    releaseReservedUsage: vi.fn(async () => undefined),
    recordAudit: vi.fn(async (params: Record<string, unknown>) => { audits.push(params); }),
  };
});

vi.mock("./prisma", () => ({
  prisma: {
    messageJob: fixture.messageJob,
    session: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => fixture.sessions.get(where.id) ?? null) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ messageJob: fixture.messageJob })),
  },
}));
vi.mock("./billing", () => ({ resolveTenantId: fixture.resolveTenantId }));
vi.mock("./api-auth", () => ({ canAccessSession: fixture.canAccessSession }));
vi.mock("./usage", () => ({ reserveUsage: fixture.reserveUsage, releaseReservedUsage: fixture.releaseReservedUsage }));
vi.mock("./audit", () => ({ recordAudit: fixture.recordAudit }));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  dismissTenantDeadLetter,
  listTenantDeadLetters,
  resendTenantDeadLetter,
  SessionOfflineError,
} from "./dead-letter-service";


const actorA = { id: "tenant-a", role: "USER" as const, ownerId: null, email: "a@example.com" };
const actorB = { id: "tenant-b", role: "USER" as const, ownerId: null, email: "b@example.com" };

describe("tenant dead-letter notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.jobs.length = 0;
    fixture.sessions.clear();
    fixture.audits.length = 0;
    fixture.jobs.push(fixture.baseJob());
    fixture.jobs.push(fixture.baseJob({ id: "job-b", tenantId: "tenant-b", recipient: "628222222222" }));
    fixture.sessions.set("db-session-a", { sessionId: "public-session-a", status: "CONNECTED", userId: "tenant-a" });
  });

  it("lists only the signed-in tenant's dead letters", async () => {
    const items = await listTenantDeadLetters(actorA);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "job-1", recipient: "628111111111", text: "Pesan yang nyangkut", safeErrorCode: "ATTEMPTS_EXHAUSTED" });
    expect(items[0].failedAt).toBe("2026-11-18T01:00:01.000Z");
  });

  it("hides tenant B's job from tenant A and rejects cross-tenant action", async () => {
    const items = await listTenantDeadLetters(actorA);
    expect(items.map((item) => item.id)).not.toContain("job-b");
    await expect(resendTenantDeadLetter(actorA, "job-b")).rejects.toMatchObject({ status: 404 });
    await expect(dismissTenantDeadLetter(actorA, "job-b")).rejects.toMatchObject({ status: 404 });
    expect(fixture.jobs.find((job) => job.id === "job-b")?.status).toBe("FAILED");
  });

  it("refuses to resend when the device is offline", async () => {
    fixture.sessions.set("db-session-a", { sessionId: "public-session-a", status: "DISCONNECTED", userId: "tenant-a" });
    await expect(resendTenantDeadLetter(actorA, "job-1")).rejects.toBeInstanceOf(SessionOfflineError);
    expect(fixture.jobs.find((job) => job.id === "job-1")?.status).toBe("FAILED");
    expect(fixture.reserveUsage).not.toHaveBeenCalled();
  });

  it("requeues a dead letter so the worker can claim it and reserves quota once", async () => {
    const result = await resendTenantDeadLetter(actorA, "job-1");
    expect(result).toMatchObject({ id: "job-1", status: "QUEUED", idempotent: false });
    const job = fixture.jobs.find((entry) => entry.id === "job-1");
    expect(job).toMatchObject({ status: "QUEUED", attempts: 0, deadLetteredAt: null, failedAt: null, safeErrorCode: null });
    expect(job!.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(job!.attempts).toBeLessThan(job!.maxAttempts);
    expect(job!.quotaReservationKey).toContain("message-dead-letter-resend:");
    expect(fixture.reserveUsage).toHaveBeenCalledTimes(1);
  });

  it("a second click does not enqueue or reserve again", async () => {
    await resendTenantDeadLetter(actorA, "job-1");
    const second = await resendTenantDeadLetter(actorA, "job-1");
    expect(second).toMatchObject({ status: "QUEUED", idempotent: true });
    expect(fixture.reserveUsage).toHaveBeenCalledTimes(1);
    expect(fixture.jobs.filter((job) => job.id === "job-1")).toHaveLength(1);
  });

  it("dismiss removes the job so it disappears from the count and is audited", async () => {
    expect(await listTenantDeadLetters(actorA)).toHaveLength(1);
    await dismissTenantDeadLetter(actorA, "job-1");
    expect(await listTenantDeadLetters(actorA)).toHaveLength(0);
    expect(fixture.jobs.find((job) => job.id === "job-b")).toBeDefined();
    expect(fixture.audits).toEqual([expect.objectContaining({
      action: "message.dead_letter_dismissed",
      resource: "message_job",
      resourceId: "job-1",
    })]);
  });

  it("after every item is decided the popup has nothing to show", async () => {
    await dismissTenantDeadLetter(actorA, "job-1");
    await expect(listTenantDeadLetters(actorA)).resolves.toEqual([]);
  });

  it("tenant B can still act on its own dead letter", async () => {
    fixture.sessions.set("db-session-b", { sessionId: "public-session-b", status: "CONNECTED", userId: "tenant-b" });
    fixture.jobs.find((job) => job.id === "job-b")!.sessionId = "db-session-b";
    await expect(resendTenantDeadLetter(actorB, "job-b")).resolves.toMatchObject({ status: "QUEUED" });
    expect(fixture.jobs.find((job) => job.id === "job-1")?.status).toBe("FAILED");
  });
});
