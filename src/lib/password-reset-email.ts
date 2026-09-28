function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export type PasswordResetEmail = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

export function buildPasswordResetEmail(input: {
  userName: string | null;
  resetUrl: string;
}): PasswordResetEmail {
  const greeting = input.userName?.trim() ? `Halo ${input.userName.trim()},` : "Halo,";
  const subject = "Atur ulang kata sandi PesanPro";

  const textBody = [
    subject,
    "",
    greeting,
    "",
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun PesanPro Anda.",
    "",
    "Buka tautan berikut untuk membuat kata sandi baru:",
    input.resetUrl,
    "",
    "Tautan ini berlaku selama 30 menit dan hanya dapat digunakan satu kali.",
    "",
    "Jika Anda tidak meminta reset kata sandi, abaikan email ini. Tidak ada perubahan yang dilakukan pada akun Anda.",
    "",
    "Email ini dikirim otomatis oleh PesanPro. Mohon jangan membalas email ini.",
  ].join("\n");

  const safeGreeting = escapeHtml(greeting);
  const safeResetUrl = escapeHtml(input.resetUrl);

  const htmlBody = `<!doctype html>
<html lang="id">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Tautan ini berlaku selama 30 menit.</div>
    <div style="max-width:620px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 18px;color:#0f172a;font-size:22px;line-height:1.35">Atur ulang kata sandi</h1>
        <p style="margin:0 0 14px;color:#334155;line-height:1.6">${safeGreeting}</p>
        <p style="margin:0 0 14px;color:#334155;line-height:1.6">Kami menerima permintaan untuk mengatur ulang kata sandi akun PesanPro Anda. Gunakan tombol di bawah untuk membuat kata sandi baru.</p>
        <p style="margin:24px 0"><a href="${safeResetUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700">Atur ulang kata sandi</a></p>
        <p style="margin:0 0 14px;color:#334155;line-height:1.6">Tautan ini berlaku selama 30 menit dan hanya dapat digunakan satu kali.</p>
        <p style="margin:0 0 14px;color:#334155;line-height:1.6">Jika Anda tidak meminta reset kata sandi, abaikan email ini. Tidak ada perubahan yang dilakukan pada akun Anda.</p>
        <p style="margin:0 0 8px;color:#334155;line-height:1.6">Jika tombol tidak berfungsi, salin dan buka tautan berikut di browser:</p>
        <p style="margin:0;color:#475569;line-height:1.6;word-break:break-all">${safeResetUrl}</p>
      </div>
      <p style="margin:14px 0 0;color:#64748b;font-size:12px;text-align:center">Email ini dikirim otomatis oleh PesanPro. Mohon jangan membalas email ini.</p>
    </div>
  </body>
</html>`;

  return { subject, textBody, htmlBody };
}
