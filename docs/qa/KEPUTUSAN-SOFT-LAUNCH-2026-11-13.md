# Keputusan Pemilik — Soft Launch PesanPro, 13 November 2026

**Status:** DECIDED oleh pemilik (Rayyan Ahmad Alfatih), disampaikan langsung di sesi 13 November 2026 pukul 09:57–09:58 WIB.
**Berlaku untuk:** soft launch (tenant undangan/terbatas) mulai 13 November 2026.
**Bukan keputusan agen.** Dokumen ini hanya mencatat keputusan pemilik dan konsekuensi teknisnya.

---

## D1 — Retensi isi pesan 30 hari + wording privasi jujur

**Keputusan (verbatim dari pemilik):**

> Saya setuju: retensi 30 hari, bukan 90 hari.
> Isi pesan (MessageJob dan WebhookOutboxEvent) disimpan maksimal 30 hari untuk keperluan pengiriman dan debugging, lalu dihapus otomatis.
> Klaim lama "Kami tidak menyimpan isi pesan Anda" dicabut dan diganti dengan kalimat jujur berikut:
> "Kami menyimpan pesan Anda maksimal 30 hari untuk keperluan pengiriman dan debugging, lalu dihapus otomatis."
> Meneruskan pesan ke webhook/AI pelanggan bukan berarti tidak menyimpan — PesanPro meneruskan pesan tersebut, dan selama 30 hari itu isi pesan tersimpan untuk pengiriman dan debugging.
> Keputusan ini berlaku untuk soft launch, 13 November 2026.

**Konsekuensi teknis yang sudah sesuai keputusan:**
- `MESSAGE_RETENTION_DAYS` default **30** (`src/lib/env.ts`).
- `runOperationalMaintenance()` menghapus baris konten > 30 hari untuk `Message`, `MessageJob`, `WebhookOutboxEvent`, `WebhookDelivery`, `WebhookAttempt`, `WebhookLog`, `ScheduledMessage`, `Story`; baris yang masih QUEUED/PROCESSING tidak ikut dihapus.
- Audit log tetap 365 hari; media privat 30 hari; auto-reply log 30 hari; QR 1 jam; OTP 1 hari.

**Perubahan copy yang menyusul keputusan ini:**
- Landing (`src/app/page.tsx`): judul seksi, paragraf, kartu privasi, dan trust row tidak lagi memakai klaim absolut.
- Kebijakan privasi (`src/app/privacy/page.tsx`): butir "delivery metadata" dan "what we do not do" diperbarui.
- `docs/panduan/README.md`: aturan dasar diperbarui.
- Klaim "tidak menyimpan pesanmu" **dicabut** dari materi publik.

**Yang masih harus diputuskan/dikerjakan (bukan bagian D1):** copy di 6 file `docs/marketing/*` yang masih menyebut dashboard bisa dibuka saat PENDING; meta keywords `self-hosted` di `/privacy` & `/terms` (P3 housekeeping).

---

## D6 — Soft launch manual-only (Midtrans Fase 2 belum dimulai)

**Keputusan (verbatim dari pemilik):**

> Saya menyatakan: soft launch PesanPro manual-only.
> Pembayaran hanya melalui transfer bank manual. Midtrans default nonaktif dan Fase 2 Midtrans belum dimulai. Tidak ada pembayaran otomatis melalui Midtrans selama soft launch.
> Prasyarat Midtrans (akun, metode pembayaran, biaya, aktivasi, dan settlement) belum dipenuhi, sehingga Fase 2 Midtrans tetap menjadi tugas lanjutan terpisah setelah soft launch.
> Keputusan ini berlaku untuk soft launch, 13 November 2026.

**Verifikasi kondisi live (13 Nov 2026 08:00 WIB):**
- `GET /api/public/onboarding` → `manual.enabled=true`, `midtrans.enabled=false`, `anyReady=true`.
- Kode `SystemConfig.midtransEnabled` default `false`; `manualTransferEnabled` default `true`.
- Tidak ada pembayaran otomatis Midtrans yang aktif.

**Konsekuensi:**
- Soft launch **tidak** menunggu Midtrans Fase 2. Gate H butir "Midtrans Fase 2 selesai ATAU manual-only dinyatakan eksplisit" → **terpenuhi oleh pernyataan ini**.
- Fase 2 tetap tugas terpisah; prasyarat akun, metode, biaya, aktivasi, dan settlement belum dipenuhi.
- Materi publik tidak boleh menjanjikan pembayaran otomatis/Midtrans selama soft launch.

---

## Ringkasan status 3 syarat soft launch

| Syarat | Status per 13 Nov 2026 10:0x WIB | Bukti |
|---|---|---|
| 1. BUG-01 reset password diperbaiki + diuji | **Kode + tes SELESAI di branch `muse_ai-fix-password-reset-smtp-gate`.** Tes baru 4/4 PASS, `typecheck` EXIT 0, lint ter-target 0 error (lint penuh gagal OOM = ENV), `git diff --check` bersih. **Deploy & uji live menunggu pemilik** | `src/lib/password-reset.ts`, `src/lib/password-reset.test.ts` |
| 2. Password sementara SuperAdmin diganti | **Menunggu pemilik** (butuh login SuperAdmin; agen tidak boleh menyentuh kredensial) | langkah di `LAPORAN-REKAYASA-LAUNCH-2026-11-13.md` §4 |
| 3. D1 + D6 dinyatakan tertulis | **SELESAI** — dokumen ini | keputusan verbatim di atas |

## Catatan eksekusi BUG-01 (13 Nov)

- Perubahan: gerbang kini menilai transport yang benar — `useSmtp = smtpConfigured()` (SMTP_HOST+SMTP_FROM) **atau** `resendConfigured()` (RESEND_API_KEY+PASSWORD_RESET_FROM). Bila keduanya kosong → log operator + tetap `accepted:true` (anti-enumerasi tetap utuh). Bila SMTP terisi → kirim via SMTP, **meski tanpa Resend**.
- Tes baru `src/lib/password-reset.test.ts`: SMTP saja, Resend saja, keduanya terisi (SMTP diprioritaskan), keduanya kosong (enumeration-safe). **4/4 PASS.**
- Gates: `typecheck` EXIT 0; `eslint` pada 5 file yang diubah → 0 error; `git diff --check` bersih. `npm run lint` penuh gagal `Fatal process out of memory: Zone` = **ENV failure** (lint penuh terakhir yang hijau: 12 Nov 20:07 pada kode tanpa perubahan di file-file ini).
