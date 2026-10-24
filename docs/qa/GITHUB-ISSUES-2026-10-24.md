# Temuan & Aksi — 24 Oktober 2026

## Akses QA terverifikasi

| Akses | Hasil |
| --- | --- |
| Superadmin `pesanpro@kingofcoding.my.id` | Role `SUPERADMIN`; `/api/users`, `/api/admin/plans`, `/api/admin/payment-verifications` → `200` |
| Tenant A `testingusera@gmail.com` | Login `302`, role `USER`, sesi `27092015` `CONNECTED` |
| Tenant B `testinguserb@gmail.com` | Login `302`, role `USER`, sesi `qa-b-session` `CONNECTED` |
| WordPress `pesanpro-test.kingofcoding.my.id` | `200`; Contact Form 7 6.2.3 + PesanPro CF7 1.0.0 aktif |
| Webhook receiver | webhook.site + httpbin disetujui pemilik |

Tidak ada kredensial yang disimpan di repo atau di disk; cookie uji sudah dihapus.

---

## L1-55 — PASS: perilaku setelah trial berakhir

**Waktu uji:** 24 Oktober 2026, 09:13 WIB (trial Tenant A berakhir 09:07 WIB).

| Pemeriksaan | Hasil |
| --- | --- |
| Login email + password | `302` ke dashboard — **masih bisa masuk** |
| `/api/auth/session` | Sesi valid, `accountActive: true` |
| `/dashboard` | `200` — dashboard terbuka |
| `/api/billing/summary` | `status: "EXPIRED"`, `trialEndsAt` & `endsAt` sudah lewat, `graceEndsAt: null` |
| Operasi komersial: `POST /api/webhooks/27092015` | `403 {"error":"Subscription is expired","code":"ENTITLEMENT_DENIED"}` |
| Operasi baca: `GET /api/webhooks/27092015` | `200` |

**Kesimpulan:** sesuai harapan roadmap — pengguna masih bisa login dan melihat data,
tetapi fitur komersial ditolak dengan pesan yang jelas. Tidak ada data yang hilang.

---

## Perpanjangan masa aktif tenant uji (superadmin)

Dilakukan lewat `PATCH /api/admin/subscriptions/{userId}` dengan alasan
`QA window extension 7 days (L13)`.

| Tenant | Plan | Status | `endsAt` baru |
| --- | --- | --- | --- |
| Tenant A | `plan_trial` | `TRIAL` | 31 Okt 2026, 09:14 WIB |
| Tenant B | `plan_starter` | `ACTIVE` | 31 Okt 2026, 09:14 WIB |

Diverifikasi lewat `/api/billing/summary` masing-masing tenant setelah perubahan.
Catatan: endpoint ini menaikkan `sessionVersion`, jadi sesi lama perlu login ulang.

---

## Instalasi plugin WordPress

- Contact Form 7 6.2.3 dipasang dari repository resmi.
- `pesanpro-contact-form-7` 1.0.0 diunggah dari repo lokal dan diaktifkan.
- Halaman setting `/wp-admin/options-general.php?page=pesanpro-cf7` → `200`.
- Base URL, integration token, dan recipient mapping **belum diisi** — akan
  dikonfigurasi saat L15.
- Catatan DNS: domain sempat `NXDOMAIN` di resolver mesin QA; setelah diperbaiki,
  akses normal `200`.

---

## [P1] Pesan gagal terkirim: `SESSION_NOT_READY` padahal sesi `CONNECTED`

**Ditemukan:** 24 Oktober 2026, 09:30–09:33 WIB, saat L13-25/26.
**Dampak:** pesan pelanggan tidak terkirim. API menerima job (`202`), lalu job
`FAILED` setelah 5 percobaan. Event `message.sent` tidak pernah keluar, sehingga
webhook pelanggan juga tidak menerima apa pun.

**Reproduksi:**
1. Sesi `qa-b-session` di dashboard berstatus `CONNECTED`.
2. `POST /api/v1/messages/text` ke `6283877315731` dengan `sessionId=qa-b-session`.
3. Respons `202`, job dibuat.
4. Dalam ±35 detik job menjadi `FAILED`, `attempts=5`,
   `error.code=SESSION_NOT_READY`, `error.message="WhatsApp device is not ready"`,
   `sentAt=null`, `deliveredAt=null`.

**Bukti:**
- Job `cmvls81bp0ooq3dzil9dulk3k` → `FAILED` (5 attempt).
- Job `cmvlsabo30or33dzias0u7jht` → `FAILED` (5 attempt).
- `GET /api/sessions/qa-b-session` → `status: "CONNECTED"`, `updatedAt`
  `2026-10-23T20:03:26Z`.
- `/api/health/live` → `uptimeSeconds` ±51.400 (proses tidak restart setelah sesi
  dihidupkan).
- Jalur kode: `dispatchQueuedMessage` menolak jika
  `waManager.getInstance(sessionId)` tidak ada, `socket` null, atau
  `instance.status !== "CONNECTED"`.
- Tidak ada delivery webhook `message.sent`; yang ada hanya event `test`.

**Dugaan penyebab (belum dikonfirmasi):** status di database dan instance di memori
berbeda. Manager bisa kehilangan instance tanpa status DB ikut berubah — misalnya
saat `stopAfterLeaseFailure` menghapus instance lalu update DB gagal (ditulis dengan
`.catch(() => undefined)`), atau saat `loadSessions` melewati sesi karena lease masih
dipegang worker lain. Untuk memastikan perlu log pm2.

**Status:** **OPEN — menunggu pemilik.** Belum ada perubahan kode.

**Dampak ke L13:** L13-25 tidak valid (pesannya tidak pernah terkirim, jadi
"tidak ada event" tidak membuktikan disable bekerja). L13-26 terblokir. Tes L13
yang membutuhkan pengiriman (07–19) ditahan sampai masalah ini selesai.
