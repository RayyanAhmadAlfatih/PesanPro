# Notifikasi kapasitas VPS dobel: sudah diperbaiki

Status: **SELESAI diperbaiki** pada 22 Nov 2026. Branch `muse_ai-fix-capacity-alert-email-2026-11-22`. Awalnya draf issue, lalu pemilik memutuskan penerima dan frekuensi, lalu kode diubah.

## Masalah awal

Email "Kapasitas VPS xx% — periksa sekarang" masuk berulang dan terlihat dobel di Gmail. Inbox SuperAdmin cepat penuh (916 pesan).

## Akar (FAKTA, terverifikasi dari kode)

- `queueCapacityAlertEmails` dulu mengambil semua user `SUPERADMIN ACTIVE` dan membuat satu `emailOutbox` per admin. Ada 2 admin, jadi 2 email per siklus.
- `eventKey` dulu `capacity-alert:${hourKey}:${admin.id}`, jadi satu email per admin per jam.
- `eventKey` memakai `admin.id`, jadi bukan dobel kirim ke satu akun. Dua email berasal dari dua admin.
- Screenshot Gmail (18 Nov 08.16 WIB) menampilkan dua email identik pada jam yang sama.

## Keputusan pemilik (22 Nov 2026)

1. Penerima: **satu alamat ops tetap**, `pesanpro@kingofcoding.my.id`.
2. Frekuensi: **1× sehari**, bukan 1×/jam.

## Perubahan kode

- `src/lib/env.ts`: env opsional `CAPACITY_ALERT_EMAIL`.
- `.env.example`: contoh `CAPACITY_ALERT_EMAIL=""` beserta catatan fallback.
- `src/lib/email-notifications.ts`:
  - Penerima tunggal. Kalau `CAPACITY_ALERT_EMAIL` terisi, pakai alamat itu; kalau kosong, pakai SuperAdmin pertama.
  - `createMany` kini satu baris, bukan satu per admin.
  - `eventKey` dari jam ke hari: `capacity-alert:${dayKey}:${recipient.id}` (WIB, `TZ` Asia/Jakarta).
- `src/lib/capacity-alerts.test.ts`: test eventKey per hari, test penerima tunggal, test fallback tanpa env.

## Cara pakai di VPS

Tambahkan ke `.env`:

```
CAPACITY_ALERT_EMAIL="pesanpro@kingofcoding.my.id"
```

Lalu restart layanan email worker agar env terbaca. Kalau dikosongkan, email tetap terkirim ke SuperAdmin pertama.

## Verifikasi

- `npx vitest run src/lib/capacity-alerts.test.ts`: 5/5 lolos.
- `npm run typecheck`, `npm run lint`: bersih.
- `npm test`: 132 file, 656 test lolos (naik 2 dari 654).
- `npm run build`: compiled, 78/78 halaman.

Tidak ada deploy oleh agent. Tidak ada perubahan data produksi.
