import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// T-17 regression: the internal worker route must accept the correct secret,
// reject wrong ones of any length, and never reach the job lookup unauthenticated.
const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  findFirst: vi.fn(),
  dispatchQueuedMessage: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/lib/prisma", () => ({ prisma: { messageJob: { findFirst: mocks.findFirst } } }));
vi.mock("@/modules/whatsapp/message-adapter", () => ({ dispatchQueuedMessage: mocks.dispatchQueuedMessage }));

import { POST } from "@/app/api/internal/message-dispatch/route";

describe("internal message dispatch worker-secret auth", () => {
  const secret = "w".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEnv.mockReturnValue({ MESSAGE_WORKER_SECRET: secret });
    mocks.findFirst.mockResolvedValue(null);
  });

  it("rejects a request without the worker secret", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/message-dispatch", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a wrong worker secret regardless of length", async () => {
    const request = new NextRequest("http://localhost/api/internal/message-dispatch", {
      method: "POST",
      headers: { "x-message-worker-secret": "w".repeat(39) },
      body: JSON.stringify({ jobId: "j1", claimToken: "t1" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("accepts the correct worker secret and reaches the claim lookup", async () => {
    const request = new NextRequest("http://localhost/api/internal/message-dispatch", {
      method: "POST",
      headers: { "x-message-worker-secret": secret },
      body: JSON.stringify({ jobId: "j1", claimToken: "t1" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(409); // claim not found: auth passed
    expect(mocks.findFirst).toHaveBeenCalled();
  });
});
