import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
  sendSmtpEmail: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./logger", () => ({ logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("./email-transport", () => ({ sendSmtpEmail: mocks.sendSmtpEmail }));

import { requestPasswordReset } from "./password-reset";

const activeUser = { id: "user-1", email: "user@example.com", status: "ACTIVE" };

function stubTransportEnv(input: { smtp?: boolean; resend?: boolean }) {
  vi.stubEnv("SMTP_HOST", input.smtp ? "smtp.example.com" : "");
  vi.stubEnv("SMTP_FROM", input.smtp ? "PesanPro <no-reply@example.com>" : "");
  vi.stubEnv("RESEND_API_KEY", input.resend ? "re_test_key" : "");
  vi.stubEnv("PASSWORD_RESET_FROM", input.resend ? "PesanPro <no-reply@example.com>" : "");
}

describe("password reset delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser);
    mocks.prisma.$transaction.mockResolvedValue([]);
    mocks.sendSmtpEmail.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("delivers over SMTP when only SMTP is configured", async () => {
    stubTransportEnv({ smtp: true });

    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });

    expect(mocks.sendSmtpEmail).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("delivers over Resend when only Resend is configured", async () => {
    stubTransportEnv({ resend: true });

    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.sendSmtpEmail).not.toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("prefers SMTP when both transports are configured", async () => {
    stubTransportEnv({ smtp: true, resend: true });

    await requestPasswordReset("user@example.com");

    expect(mocks.sendSmtpEmail).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the response enumeration-safe and logs when no transport exists", async () => {
    stubTransportEnv({});

    await expect(requestPasswordReset("user@example.com")).resolves.toEqual({ accepted: true });

    expect(mocks.sendSmtpEmail).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Auth",
      expect.stringContaining("no email transport is configured"),
    );
  });
});
