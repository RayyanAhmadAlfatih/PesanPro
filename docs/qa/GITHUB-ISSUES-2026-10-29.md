# L16 — Billing, Plans & Commercial (live, 29 Oktober 2026)

Sesi ini memakai akses SUPERADMIN yang baru diberikan pemilik. Sebelumnya 11 tes
L16 tertahan karena kata sandi superadmin selalu ditolak.

Kondisi awal yang dicatat sebelum tes: tenant B `STARTER` / `ACTIVE` /
berakhir `2026-10-31T02:14:12Z`, tanpa override, `deviceLimit` 1. Semua plan
aktif dengan TRIAL sebagai default.

---

## Ringkasan hasil

| Tes | Status | Bukti singkat |
| --- | --- | --- |
| L16-09 | **PASS** | `POST /api/payment-verifications` → `201`, status `PENDING`, nominal 149.000 diambil dari plan (bukan dari klien) |
| L16-11 | **PASS** | Superadmin melihat 1 pengajuan `PENDING` lengkap dengan email, plan, nominal, referensi; path penyimpanan bukti tidak ikut dikirim |
| L16-12 | **PASS** | Approve tanpa `reviewNote` → `400`, pengajuan tetap `PENDING` |
| L16-13 | **FAIL — bug P1** | Approve + catatan **berhasil di database** (`APPROVED`, reviewer terisi), tetapi respons HTTP `500` |
| L16-15 | **PASS** | Setelah approve, langganan tenant B otomatis jadi `BISNIS` aktif sampai 29 Nov 2026 |
| L16-16 | **PASS** | Assign `STARTER` lewat admin → `200`, `deviceLimit` 3 → 1, tanggal berakhir sesuai input |
| L16-17 | **PASS** | Ganti ke `PRO` → `200`, `deviceLimit` 1 → 10, tanggal berakhir berubah |
| L16-18 | **PASS (API)** | Override `WEBHOOKS` aktif dengan limit 9 → `200`, tersimpan benar |
| L16-19 | **PASS (API)** | Override dinonaktifkan → `200`, `enabled=false` |
| L16-20 | **PASS (API)** | Limit override diubah ke 42 → `200`, nilai tersimpan |
| L16-21 | **BELUM** | Butuh sesi tenant untuk membuktikan override kedaluwarsa kembali ke plan default |
| L16-22 | **PASS** | Jadikan `STARTER` default → TRIAL otomatis kehilangan status default |
| L16-23 | **PASS** | `BISNIS` dinonaktifkan → hilang dari `/api/plans`; diaktifkan lagi → muncul kembali |
| L16-14 | **BELUM** | Butuh pengajuan `PENDING` baru; sesi tenant 24 jam sudah kedaluwarsa |

---

## Bug P1 — approve/reject pembayaran selalu balas HTTP 500

### Yang dialami admin

Admin menekan **Approve**, aplikasi menampilkan pesan gagal, dan daftar tidak
menyegarkan. Padahal di database pengajuan sudah `APPROVED` dan langganan
pelanggan sudah aktif. Kalau admin menekan lagi, hasilnya sama: tetap pesan
gagal.

### Penyebab (sudah dipastikan dari kode)

Respons endpoint review ikut mengirim data plan beserta hak aksesnya. Salah satu
kolom hak akses (`limitValue`) bertipe `BigInt`, dan tipe itu tidak bisa diubah
ke JSON. Jadi transaksi sudah selesai dan tersimpan, lalu pembentukan respons
gagal → `500` dengan body kosong.

Endpoint lain yang mengirim data serupa (`/api/admin/plans`,
`/api/admin/entitlement-overrides`) sudah mengubah nilai itu menjadi teks, hanya
endpoint review ini yang terlewat. Karena body-nya kosong, halaman dashboard
bahkan gagal membaca JSON dan menampilkan pesan umum "Unable to review payment".

### Perbaikan

- `src/lib/payment-verification-service.ts` — fungsi baru `serializeReviewResponse()`
  mengubah `limitValue` menjadi teks, membuang field bukti bayar internal, dan
  menyertakan `subscription` + `idempotent` seperti sebelumnya.
- `src/app/api/admin/payment-verifications/[id]/route.ts` — memakai fungsi itu.
- `src/lib/payment-verification-service.test.ts` — 2 tes baru: bentuk normal dan
  kasus tanpa plan. Total 11 tes di file ini.

Gerbang lokal: 11/11 tes lolos, `tsc --noEmit` bersih, eslint bersih.

### Status

**Belum aktif di produksi.** Perbaikannya ada di route API, jadi butuh build
`.next` dan pemindahan build seperti biasa — bukan hanya `git pull`.

Sampai build itu terpasang, tombol approve/reject di dashboard masih menampilkan
pesan gagal meski datanya berubah.

---

## Catatan lain

- Sesi tenant B kedaluwarsa setelah 24 jam (login 28 Okt 09:57), sehingga
  pengajuan pembayaran kedua tidak bisa dibuat. Ini yang menahan L16-14 dan
  L16-21.
- Pengajuan `uji-L16-09-transfer` tetap tersimpan sebagai `APPROVED` di riwayat;
  itu jejak audit yang wajar dan tidak dihapus.
- Semua perubahan lain sudah dikembalikan: plan aktif dan TRIAL default seperti
  semula, override dihapus, tenant B kembali `STARTER` / `ACTIVE` /
  `2026-10-31T02:14:12Z` dengan `deviceLimit` 1.
