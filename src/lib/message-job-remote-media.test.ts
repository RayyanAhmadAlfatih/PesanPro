import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "job-1",
    status: "QUEUED",
    type: data.type,
    recipient: data.recipient,
    whatsappMessageId: data.whatsappMessageId,
    attempts: 0,
    maxAttempts: data.maxAttempts,
    safeErrorCode: null,
    safeErrorMessage: null,
    availableAt: now,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  const tx = { messageJob: { create } };
  return {
    create,
    tx,
    privateMediaFindFirst: vi.fn(),
    lockPrivateMediaForUse: vi.fn(),
  };
});

vi.mock("./api-auth", () => ({ canAccessSession: vi.fn(async () => true) }));
vi.mock("./billing", () => ({ resolveTenantId: vi.fn(async () => "tenant-1") }));
vi.mock("./usage", () => ({
  reserveUsage: vi.fn(async () => undefined),
  releaseReservedUsage: vi.fn(async () => undefined),
  commitReservedUsage: vi.fn(async () => undefined),
}));
vi.mock("./private-media-lifecycle", () => ({ lockPrivateMediaForUse: fixture.lockPrivateMediaForUse }));
vi.mock("./remote-media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./remote-media")>();
  return { ...actual, validateRemoteMediaUrl: vi.fn(async (url: string) => url) };
});
vi.mock("./prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn(async () => ({ id: "session-db-1", userId: "tenant-1" })) },
    privateMedia: { findFirst: fixture.privateMediaFindFirst },
    messageJob: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (callback: (tx: typeof fixture.tx) => unknown) => callback(fixture.tx)),
  },
}));

import { enqueueMessage } from "./message-job-service";

describe("remote media message jobs", () => {
  beforeEach(() => {
    fixture.create.mockClear();
    fixture.privateMediaFindFirst.mockClear();
    fixture.lockPrivateMediaForUse.mockClear();
  });

  it("stores only the URL in the durable job and does not create or lock PrivateMedia", async () => {
    await enqueueMessage({
      actor: { id: "user-1", role: "USER" },
      operation: "messages.media.create",
      idempotencyKey: "remote-image-1",
      sessionPublicId: "device-1",
      recipient: "628123456789",
      type: "IMAGE",
      mediaUrl: "https://cdn.example.com/photo.webp",
      mimeType: "image/webp",
    });

    expect(fixture.privateMediaFindFirst).not.toHaveBeenCalled();
    expect(fixture.lockPrivateMediaForUse).not.toHaveBeenCalled();
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mediaId: undefined,
        requestPayload: expect.objectContaining({
          mediaId: null,
          mediaUrl: "https://cdn.example.com/photo.webp",
          mimeType: "image/webp",
        }),
      }),
    }));
  });
});
