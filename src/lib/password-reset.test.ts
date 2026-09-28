import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: {
    id: "reset-1",
    userId: "user-a",
    usedAt: null as Date | null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  },
  userUpdate: vi.fn(),
  tokenDeleteMany: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "new-hash") } }));
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./email-transport", () => {
  class EmailTransportError extends Error {
    constructor(public readonly code: "SMTP_NOT_CONFIGURED" | "SMTP_DELIVERY_FAILED") {
      super(code);
      this.name = "EmailTransportError";
    }
  }
  return { EmailTransportError, sendSmtpEmail: vi.fn() };
});
vi.mock("./password-policy", async (importOriginal) => {
  const original = await importOriginal<typeof import("./password-policy")>();
  return { ...original, generatePasswordResetSecret: () => "smtp-flow-test-secret".repeat(2) };
});
vi.mock("./prisma", () => {
  const transactionClient = {
    passwordResetToken: {
      findUnique: vi.fn(async () => ({ ...state.token })),
      updateMany: vi.fn(async () => {
        if (state.token.usedAt) return { count: 0 };
        state.token.usedAt = new Date();
        return { count: 1 };
      }),
      deleteMany: state.tokenDeleteMany,
    },
    user: { update: state.userUpdate },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (input: unknown) =>
        Array.isArray(input) ? input : (input as (tx: unknown) => unknown)(transactionClient),
      ),
      user: { findUnique: vi.fn() },
      passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() },
    },
  };
});

import { consumePasswordReset, requestPasswordReset } from "./password-reset";
import { EmailTransportError, sendSmtpEmail } from "./email-transport";
import { logger } from "./logger";
import { prisma } from "./prisma";

describe("roadmap L1 password reset durability", () => {
  beforeEach(() => {
    state.token.usedAt = null;
    state.token.expiresAt = new Date("2099-01-01T00:00:00.000Z");
    state.userUpdate.mockReset();
    state.tokenDeleteMany.mockReset();
  });

  it("[L1-18][L1-19] consumes a valid token exactly once", async () => {
    const secret = "a".repeat(48);
    await expect(consumePasswordReset(secret, "StrongPass123")).resolves.toMatchObject({
      success: true,
      userId: "user-a",
    });
    await expect(consumePasswordReset(secret, "StrongPass123")).resolves.toEqual({ success: false });
    expect(state.userUpdate).toHaveBeenCalledTimes(1);
    expect(state.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-a" },
      data: expect.objectContaining({
        password: "new-hash",
        sessionVersion: { increment: 1 },
      }),
    }));
  });

  it("[L1-20] rejects an expired reset token without updating the user", async () => {
    state.token.expiresAt = new Date("2000-01-01T00:00:00.000Z");
    await expect(consumePasswordReset("b".repeat(48), "StrongPass123")).resolves.toEqual({ success: false });
    expect(state.userUpdate).not.toHaveBeenCalled();
  });
});

describe("password reset request over SMTP", () => {
  const secret = "smtp-flow-test-secret".repeat(2);

  const findUser = vi.mocked(prisma.user.findUnique);
  const sendEmail = vi.mocked(sendSmtpEmail);
  const logError = vi.mocked(logger.error);

  beforeEach(() => {
    vi.clearAllMocks();
    sendEmail.mockResolvedValue(undefined);
    vi.stubEnv("PASSWORD_RESET_BASE_URL", "https://app.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function activeUser(name: string | null = "Raka") {
    findUser.mockResolvedValue({ id: "user-a", email: "user@example.com", name, status: "ACTIVE" } as never);
  }

  function sentEmail() {
    expect(sendEmail).toHaveBeenCalledTimes(1);
    return sendEmail.mock.calls[0][0];
  }

  it("delivers exactly one SMTP email for a known ACTIVE account", async () => {
    activeUser();

    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });

    const email = sentEmail();
    const resetUrl = `https://app.example.com/auth/reset-password?token=${secret}`;
    expect(email.toEmail).toBe("user@example.com");
    expect(email.toName).toBe("Raka");
    expect(email.subject).toBe("Atur ulang kata sandi PesanPro");
    expect(email.textBody).toContain(resetUrl);
    expect(email.htmlBody).toContain(resetUrl);
    expect(email.textBody).toContain("berlaku selama 30 menit");
    expect(email.textBody).toContain("hanya dapat digunakan satu kali");
    expect(logError).not.toHaveBeenCalled();
  });

  it("uses a safe Message-ID derived from the token hash, never the raw secret", async () => {
    activeUser();

    await requestPasswordReset("user@example.com");

    const email = sentEmail();
    expect(email.messageId).toMatch(/^password-reset\.[0-9a-f]{32}@app\.example\.com$/);
    expect(email.messageId).not.toContain(secret);
    expect(`${email.subject}${email.textBody}${email.htmlBody}`).not.toContain("api.resend.com");
  });

  it("greets by name in HTML-escaped form", async () => {
    activeUser(`Ana <Admin> & "Co"`);

    await requestPasswordReset("user@example.com");

    const email = sentEmail();
    expect(email.htmlBody).toContain("Halo Ana &lt;Admin&gt; &amp; &quot;Co&quot;,");
    expect(email.htmlBody).not.toContain(`Ana <Admin> & "Co"`);
  });

  it("does not deliver for an unknown email but returns the generic response", async () => {
    findUser.mockResolvedValue(null);

    await expect(requestPasswordReset("unknown@example.com")).resolves.toEqual({ accepted: true });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.passwordResetToken.create)).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("does not deliver for a non-active account but returns the generic response", async () => {
    findUser.mockResolvedValue({ id: "user-b", email: "blocked@example.com", name: null, status: "SUSPENDED" } as never);

    await expect(requestPasswordReset("blocked@example.com")).resolves.toEqual({ accepted: true });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("keeps the generic response on SMTP failure and never logs the secret", async () => {
    activeUser();
    sendEmail.mockRejectedValue(new EmailTransportError("SMTP_DELIVERY_FAILED"));

    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });

    expect(logError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).toContain("SMTP_DELIVERY_FAILED");
    expect(logged).not.toContain(secret);
  });

  it("warns in production when SMTP is not configured, stays silent otherwise", async () => {
    activeUser();
    sendEmail.mockRejectedValue(new EmailTransportError("SMTP_NOT_CONFIGURED"));

    vi.stubEnv("NODE_ENV", "production");
    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logError.mock.calls)).toContain("not configured");
    expect(JSON.stringify(logError.mock.calls)).not.toContain(secret);

    logError.mockClear();
    vi.stubEnv("NODE_ENV", "test");
    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });
    expect(logError).not.toHaveBeenCalled();
  });
});
