import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requestLoginOtp: vi.fn() }));
vi.mock("@/lib/otp-service", () => ({ requestLoginOtp: mocks.requestLoginOtp }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));

import { POST } from "./route";

function otpRequest(email: string) {
  return new NextRequest("http://localhost/api/auth/otp/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("OTP request anti-enumeration response (T5 must not change it)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("answers an unknown address with the same generic success shape as a real send", async () => {
    mocks.requestLoginOtp.mockResolvedValue({ ok: false, reason: "undeliverable" });
    const unknown = await POST(otpRequest("tidak-ada@example.invalid"));
    const unknownBody = await unknown.json();
    expect(unknown.status).toBe(200);
    expect(unknownBody).toEqual({
      status: true,
      message: "Code sent.",
      data: { resendAfterMs: 0 },
    });

    mocks.requestLoginOtp.mockResolvedValue({ ok: true, resendAfterMs: 60_000 });
    const known = await POST(otpRequest("ada@example.com"));
    const knownBody = await known.json();
    expect(known.status).toBe(200);
    expect(Object.keys(knownBody).sort()).toEqual(Object.keys(unknownBody).sort());
    expect(Object.keys(knownBody.data).sort()).toEqual(Object.keys(unknownBody.data).sort());
    expect(knownBody.status).toBe(true);
    expect(knownBody.message).toBe("Code sent.");
  });

  it("never returns a 'not found' / 'unregistered' marker for an unknown address", async () => {
    mocks.requestLoginOtp.mockResolvedValue({ ok: false, reason: "undeliverable" });
    const response = await POST(otpRequest("tidak-ada@example.invalid"));
    const serialized = JSON.stringify(await response.json()).toLowerCase();
    for (const forbidden of ["not found", "unknown", "unregistered", "tidak terdaftar", "tidak ditemukan"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("still rejects a malformed email with 400", async () => {
    const response = await POST(otpRequest("bukan-email"));
    expect(response.status).toBe(400);
    expect(mocks.requestLoginOtp).not.toHaveBeenCalled();
  });
});
