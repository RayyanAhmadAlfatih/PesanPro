import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";
import { buildLoginOtpEmail, isLoginOtpEmailConfigured } from "./otp-email";

describe("login OTP email", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("TZ", "Asia/Jakarta");
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("puts the code in the subject, the text body, and the HTML body", () => {
    const email = buildLoginOtpEmail({ code: "042317" });

    expect(email.subject).toBe("Kode login PesanPro: 042317");
    expect(email.textBody).toContain("Kode login Anda: 042317");
    expect(email.htmlBody).toContain("042317");
  });

  it("keeps leading zeros intact through every part of the message", () => {
    const email = buildLoginOtpEmail({ code: "000001" });
    expect(email.subject).toContain("000001");
    expect(email.textBody).toContain("000001");
    expect(email.htmlBody).toContain("000001");
  });

  it("states the validity window and the do-not-share warning", () => {
    const email = buildLoginOtpEmail({ code: "123456" });
    expect(email.textBody).toContain("10 menit");
    expect(email.textBody).toContain("hanya bisa dipakai sekali");
    expect(email.textBody).toContain("ganti password");
  });

  it("greets the user by name only when a name is known", () => {
    expect(buildLoginOtpEmail({ code: "123456", toName: "Raka" }).textBody).toContain("Halo Raka,");
    expect(buildLoginOtpEmail({ code: "123456", toName: "   " }).textBody.startsWith("Halo,")).toBe(true);
    expect(buildLoginOtpEmail({ code: "123456", toName: null }).htmlBody).not.toContain("Halo");
  });

  it("escapes a name that tries to inject markup", () => {
    const email = buildLoginOtpEmail({ code: "123456", toName: "Raka <script>" });
    expect(email.htmlBody).toContain("Raka &lt;script&gt;");
    expect(email.htmlBody).not.toContain("<script>");
  });

  it("writes no em dash", () => {
    const email = buildLoginOtpEmail({ code: "123456" });
    expect(`${email.subject}${email.textBody}${email.htmlBody}`).not.toContain("—");
  });

  it("reports whether SMTP is configured", () => {
    expect(isLoginOtpEmailConfigured()).toBe(false);
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_FROM", "PesanPro <no-reply@example.com>");
    _resetEnvCache();
    expect(isLoginOtpEmailConfigured()).toBe(true);
  });
});
