# ISSUE-01 — Reset password dikirim via Resend HTTP API, bukan SMTP; gagal senyap bila hanya SMTP dikonfigurasi

- **Severity:** Medium
- **REQ:** REQ-16 ("Reset password via SMTP")
- **TC:** TC-056 (FAIL)
- **Branch:** `workbuddy-audit-privacy-branding-2026-10-11` (HEAD `c6fbc9a`)

## Ringkasan

Requirement menyatakan reset password dikirim via SMTP. Implementasi aktual mengirim lewat HTTP API Resend (`https://api.resend.com/emails`). Jalur SMTP memang ada di repo (`src/lib/email-transport.ts`), tetapi hanya dipakai oleh email outbox (notifikasi), bukan oleh reset password.

## Bukti (file:line)

- `src/lib/password-reset.ts:16-40` — `sendResetEmail()` membaca `process.env.RESEND_API_KEY` dan `process.env.PASSWORD_RESET_FROM`, lalu `fetch("https://api.resend.com/emails", ...)`.
- `src/lib/password-reset.ts:69-78` — jika pengiriman gagal, hanya `logger.error(...)` dan **hanya bila `NODE_ENV === "production"`**; fungsi tetap `return { accepted: true }`.
- `src/lib/email-transport.ts:34` — `sendSmtpEmail()` (SMTP via `emailjs`) ada, tetapi satu-satunya pemakai adalah `src/lib/email-outbox.ts:74`.
- `src/lib/env.ts:16-24` — `RESEND_API_KEY`/`PASSWORD_RESET_FROM` dan `SMTP_*` sama-sama opsional.

## Langkah reproduksi

1. Konfigurasi `.env` hanya dengan `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` (sesuai REQ-16), tanpa `RESEND_API_KEY`/`PASSWORD_RESET_FROM`.
2. Jalankan aplikasi, buka `/auth/forgot-password`, isi email akun yang valid.
3. `POST /api/auth/forgot-password` → respons `200 { success: true, message: "If the account exists, ..." }`.
4. Tidak ada email yang terkirim. Tidak ada error yang terlihat oleh pengguna.

## Dampak

- Pengguna yang lupa password **tidak bisa memulihkan akun**, padahal operator sudah mengonfigurasi SMTP sesuai requirement. Gagal senyap: UI melaporkan sukses.
- Blocker operasional menjelang launch untuk tenant yang tidak memakai Resend.
- Bukan masalah keamanan (tidak ada kebocoran data), tetapi fungsi inti rusak.

## Catatan

Token reset tetap dibuat dengan benar (`tokenHash`, TTL 30 menit, sekali pakai) — hanya jalur pengiriman yang salah.
