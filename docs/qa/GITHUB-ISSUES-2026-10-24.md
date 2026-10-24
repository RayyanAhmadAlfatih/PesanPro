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
