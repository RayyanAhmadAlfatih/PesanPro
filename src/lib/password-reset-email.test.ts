import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail } from "./password-reset-email";

describe("password reset email template", () => {
  it("uses the frozen copy, reset URL, expiry, and one-time guidance", () => {
    const resetUrl = "https://pesanpro.example.com/auth/reset-password?token=abc123";
    const email = buildPasswordResetEmail({
      userName: "Raka <Owner>",
      resetUrl,
    });

    expect(email.subject).toBe("Atur ulang kata sandi PesanPro");
    expect(email.textBody).toContain("Tautan ini berlaku selama 30 menit dan hanya dapat digunakan satu kali.");
    expect(email.textBody).toContain("Tidak ada perubahan yang dilakukan pada akun Anda.");
    expect(email.textBody).toContain(resetUrl);
    expect(email.htmlBody).toContain("Raka &lt;Owner&gt;");
    expect(email.htmlBody).toContain("Atur ulang kata sandi");
    expect(email.htmlBody).toContain("Tautan ini berlaku selama 30 menit.");
    expect(email.htmlBody).toContain("Mohon jangan membalas email ini.");
  });

  it("uses a neutral greeting when the account has no name", () => {
    const email = buildPasswordResetEmail({
      userName: null,
      resetUrl: "https://pesanpro.example.com/auth/reset-password?token=abc123",
    });

    expect(email.textBody).toContain("\nHalo,\n");
    expect(email.htmlBody).toContain(">Halo,<");
  });

  it("escapes user-controlled values in HTML", () => {
    const email = buildPasswordResetEmail({
      userName: "<img src=x onerror=alert(1)>",
      resetUrl: "https://pesanpro.example.com/reset?x=1&y=2",
    });

    expect(email.htmlBody).not.toContain("<img src=x");
    expect(email.htmlBody).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.htmlBody).toContain("x=1&amp;y=2");
  });
});
