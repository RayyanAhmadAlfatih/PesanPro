import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: {
    id: "user-a",
    name: "Raka",
    email: "raka@example.com",
    status: "ACTIVE",
  } as { id: string; name: string | null; email: string; status: string } | null,
  token: {
    id: "reset-1",
    userId: "user-a",
    usedAt: null as Date | null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  },
  sendSmtpEmail: vi.fn(),
  loggerError: vi.fn(),
  userUpdate: vi.fn(),
  tokenDeleteMany: vi.fn(),
  requestDeleteMany: vi.fn(),
  requestCreate: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "new-hash") } }));
vi.mock("./logger", () => ({ logger: { error: state.loggerError } }));
vi.mock("./email-transport", () => ({ sendSmtpEmail: state.sendSmtpEmail }));
vi.mock("./prisma", () => {
  const tx = {
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
      user: { findUnique: vi.fn(async () => state.user) },
      passwordResetToken: {
        deleteMany: state.requestDeleteMany,
        create: state.requestCreate,
      },
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === "function") return (input as (client: typeof tx) => unknown)(tx);
        return Promise.all(input as Promise<unknown>[]);
      }),
    },
  };
});

import { _resetEnvCache } from "./env";
import { consumePasswordReset, requestPasswordReset } from "./password-reset";

describe("password reset delivery and durability", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("PASSWORD_RESET_BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_FROM", "PesanPro <no-reply@example.com>");
    _resetEnvCache();

    state.user = {
      id: "user-a",
      name: "Raka",
      email: "raka@example.com",
      status: "ACTIVE",
    };
    state.token.usedAt = null;
    state.token.expiresAt = new Date("2099-01-01T00:00:00.000Z");
    state.sendSmtpEmail.mockReset().mockResolvedValue(undefined);
    state.loggerError.mockReset();
    state.userUpdate.mockReset();
    state.tokenDeleteMany.mockReset();
    state.requestDeleteMany.mockReset().mockResolvedValue({ count: 1 });
    state.requestCreate.mockReset().mockResolvedValue({ id: "new-token" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("sends one SMTP reset email for an active account without putting the raw token in the Message-ID", async () => {
    await expect(requestPasswordReset(" RAKA@example.com ")).resolves.toEqual({ accepted: true });

    expect(state.sendSmtpEmail).toHaveBeenCalledOnce();
    const email = state.sendSmtpEmail.mock.calls[0][0] as {
      messageId: string;
      subject: string;
      textBody: string;
      htmlBody: string;
    };
    expect(email.subject).toBe("Atur ulang kata sandi PesanPro");
    const token = email.textBody.match(/token=([^\s]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(email.htmlBody).toContain("/auth/reset-password?token=");
    expect(email.messageId).toMatch(/^<password-reset-[a-f0-9]+@pesanpro\.local>$/);
    expect(email.messageId).not.toContain(token as string);
  });

  it.each([
    ["unknown account", null],
    ["inactive account", { id: "user-a", name: "Raka", email: "raka@example.com", status: "SUSPENDED" }],
  ])("keeps the public response generic for %s and does not send email", async (_label, user) => {
    state.user = user as typeof state.user;

    await expect(requestPasswordReset("raka@example.com")).resolves.toEqual({ accepted: true });
    expect(state.sendSmtpEmail).not.toHaveBeenCalled();
  });

  it("keeps the public response generic when SMTP delivery fails and logs no secret material", async () => {
    state.sendSmtpEmail.mockRejectedValue(new Error("provider failure"));

    await expect(requestPasswordReset("raka@example.com")).resolves.toEqual({ accepted: true });

    expect(state.loggerError).toHaveBeenCalledWith("Auth", "Password reset email delivery failed");
    const logged = JSON.stringify(state.loggerError.mock.calls);
    expect(logged).not.toContain("token=");
    expect(logged).not.toContain("provider failure");
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
