import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock("./prisma", () => ({
  prisma: { emailOutbox: { updateMany: mocks.updateMany } },
}));

import { calculateEmailBackoffMs, executeClaimedEmail, failClaimedEmail } from "./email-outbox";
import { EmailTransportError } from "./email-transport";

function claim(attempts = 1, maxAttempts = 5) {
  return {
    claimToken: "worker-1:claim-1",
    leaseMs: 30_000,
    email: {
      id: "email-1",
      eventKey: "payment-approved:payment-1:user-1",
      toEmail: "user@example.com",
      toName: "User",
      subject: "Payment confirmed",
      textBody: "Text",
      htmlBody: "<p>Text</p>",
      attempts,
      maxAttempts,
    },
  } as never;
}

describe("email outbox delivery", () => {
  beforeEach(() => mocks.updateMany.mockReset());

  it("marks an owned email as sent after SMTP succeeds", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const deliverer = vi.fn().mockResolvedValue(undefined);

    await expect(executeClaimedEmail(claim(), deliverer)).resolves.toEqual({ action: "SENT" });
    expect(deliverer).toHaveBeenCalledWith(expect.objectContaining({ toEmail: "user@example.com" }));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "email-1", status: "PROCESSING", lockedBy: "worker-1:claim-1" },
      data: expect.objectContaining({ status: "SENT" }),
    }));
  });

  it("requeues a transient SMTP failure with a safe error", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const result = await failClaimedEmail(claim(1, 5), new EmailTransportError("SMTP_DELIVERY_FAILED"));

    expect(result.retrying).toBe(true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PENDING",
        safeErrorCode: "SMTP_DELIVERY_FAILED",
        safeErrorMessage: "SMTP delivery failed",
      }),
    }));
  });

  it("dead-letters an email after its final attempt", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const result = await failClaimedEmail(claim(5, 5), new Error("secret provider detail"));

    expect(result.retrying).toBe(false);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "DEAD_LETTER",
        safeErrorCode: "SMTP_DELIVERY_FAILED",
        safeErrorMessage: "SMTP delivery failed",
      }),
    }));
  });

  it("uses deterministic bounded retry delays", () => {
    expect(calculateEmailBackoffMs(3, "email-1")).toBe(calculateEmailBackoffMs(3, "email-1"));
    expect(calculateEmailBackoffMs(20, "email-1")).toBeLessThanOrEqual(36 * 60_000);
  });
});
