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

---

# L17 — sebagian (tes baca-saja, 29 Oktober 2026)

Tes yang tidak mengubah data dikerjakan lebih dulu supaya tidak menunggu sesi
tenant.

| Tes | Status | Bukti |
| --- | --- | --- |
| L17-01 | **PASS** | `GET /api/users` mengembalikan semua akun dengan role, status, `deviceLimit`, dan langganan |
| L17-21 | **PASS** | 7 proses (`WEB` + 6 worker) semua `HEALTHY`, heartbeat 29 Okt 03:17:47Z |
| L17-22 | **PASS** | Latensi MySQL muncul (584–634 ms) dan memicu alert `DATABASE_LATENCY` |
| L17-23 | **PASS** | Penyimpanan privat `ok`, sisa 16,2 GB dari 63,3 GB |
| L17-24 | **PASS** | CPU 24,2%, memori 56,5%, disk 73,3% |
| L17-25 | **PASS** | 8 antrean dengan angka pending/proses/dead-letter |
| L17-29 | **PASS** | `user.login` menyimpan email; `user.logout` tercatat |
| L17-30 | **PASS** | Aksi istimewa tercatat lengkap dengan email pelaku |

## Yang perlu ditinjau (bukan penghalang)

1. **Latensi database 584–634 ms** untuk query kesiapan. Alert
   `database-latency:mysql` sudah terbuka sejak 17 Sep dengan 431 kemunculan.
   Angka ini wajar bila query memang berat, tetapi untuk aplikasi yang baru
   dipakai beberapa tenant, ini perlu dilihat sebelum trafik naik.
2. **21 dead-letter di antrean `messages`** dan 4 kondisi warning aktif. Bukan
   bug, tetapi menandakan ada pekerjaan yang berhenti dan menunggu tindakan
   operator.
3. **Audit logout tanpa email dan IP** (`userEmail: null`, `ip: null`), hanya
   `userId`. Untuk investigasi, menambahkan email dan IP akan jauh lebih
   berguna. Cacat kecil (P3), bukan penghalang rilis.

## Belum dikerjakan di L17

L17-02…15, 20, 26…28, dan 31…44 masih menunggu: sebagian butuh sesi tenant
(notifikasi diterima user), sebagian lagi mengubah tampilan yang dilihat
pelanggan sungguhan (nama aplikasi, logo, pengumuman popup), jadi perlu
persetujuan pemilik sebelum dijalankan di produksi.

---

# Verifikasi ulang L16 lewat browser (29 Okt 2026, 16:1x WIB)

Tes sebelumnya dijalankan lewat API. Bagian ini mengulang alur yang sama di
aplikasi sungguhan (Chrome, sesi login asli) untuk memastikan tampilannya juga
bekerja — bukan hanya endpoint-nya.

## Yang diulang di UI

| Tes | Hasil UI |
| --- | --- |
| L16-09 | **PASS** — form "Submit payment proof" diisi (plan Bisnis, referensi `uji-L16-14-tolak-ui`, berkas PNG), tombol "Kirim untuk diverifikasi" aktif lalu mengirim. Pengajuan masuk `PENDING` dan muncul di riwayat. |
| L16-12 | **PASS** — menekan "Approve & activate" tanpa catatan memunculkan pesan **"Add a review note first"**, pengajuan tetap `PENDING`. |
| L16-13 | **FAIL terkonfirmasi di layar** — lihat di bawah |
| L16-14 | **PASS (data)** — "Reject" dengan catatan mengubah pengajuan menjadi `REJECTED` di server. Tetapi layar tidak memberi umpan balik apa pun dan barisnya masih tampak `PENDING` sampai halaman dimuat ulang. |

## Bukti bug P1 terlihat langsung oleh admin

Alur yang saya lakukan sebagai superadmin:

1. Buka **Operasi Komersial**, isi catatan review, tekan **Approve & activate**.
2. Tidak ada pesan sukses, tidak ada pesan gagal, dan daftar tidak berubah —
   baris tetap berlabel `PENDING` dengan tombol Approve/Reject masih aktif.
3. Saya periksa ke server: pengajuannya **sudah `APPROVED`** dan langganan tenant
   sudah aktif.
4. Muat ulang halaman → baris baru berubah menjadi `APPROVED`.

Tangkapan layar sebelum muat ulang: `.qa-tmp/l16-ui-stale.png` (baris
`uji-L16-14-reject-ui` masih `PENDING` padahal server sudah `REJECTED`).

Jadi dampak nyatanya lebih buruk daripada "muncul pesan error": **admin tidak
mendapat umpan balik sama sekali**. Kalau dia tidak memuat ulang halaman, dia
akan mengira tombolnya tidak bekerja dan mencoba lagi berulang kali.

Perbaikan `8ec211f` menutup penyebabnya (respons 500), sehingga jalur sukses
akan kembali berjalan dan daftar ikut disegarkan. **Masih menunggu build `.next`.**

## Catatan teknis saat menguji

- Unggah berkas lewat CLI browser ditolak Chrome ("Not allowed") karena izin
  "Allow access to file URLs" tidak aktif untuk ekstensi. Saya tidak mengubah
  setelan itu; berkas dilampirkan langsung ke input form di halaman, lalu form
  dikirim seperti biasa. Jalur unggah server tetap yang sebenarnya (multipart).
- Halaman Operasi Komersial butuh ±15–20 detik sampai daftar pembayaran muncul;
  sebelum itu yang terlihat hanya kerangka kosong.

---

# L16-21 + L17 lanjutan (29 Okt 2026, 17:4x WIB)

## L16-21 — override berbatas waktu: **PASS**

Override `WEBHOOKS` dipasang dengan limit 42 dan masa berlaku 3 menit.

| Waktu | Efektif untuk tenant | Sumber |
| --- | --- | --- |
| Sebelum kedaluwarsa | limit **42** | `OVERRIDE` |
| Setelah kedaluwarsa (10:51:27Z, batas 10:50:06Z) | limit **1** | `PLAN` |

Baris override tetap tersimpan dengan `expiresAt` yang sudah lewat — memang
seharusnya begitu supaya jejak auditnya tidak hilang — tetapi tidak lagi dipakai
saat menghitung hak akses. Ini sekaligus membuktikan sisi "efektif" dari
L16-18/19/20 yang sebelumnya baru diuji di level API. Override uji sudah dihapus.

## L17 — hasil tambahan

| Tes | Status | Bukti |
| --- | --- | --- |
| L17-02 | **PASS** | Nama dan email tenant A diubah lewat admin → langsung berubah di daftar; dikembalikan ke nilai semula |
| L17-03 | **PASS** | Kata sandi diubah dari sisi admin → login dengan sandi baru berhasil (`302` ke dashboard); sandi asli dikembalikan dan login lama berhasil lagi |
| L17-04 | **PASS** | `USER` → `SUPERADMIN`: sesi baru membawa role `SUPERADMIN` dan `/api/users` dijawab `200` |
| L17-05 | **PASS** | `SUPERADMIN` → `USER`: role kembali, sesi lama ditolak `401` saat mengakses `/api/users` |
| L17-06 | **PASS** | `SUSPENDED`: login ditolak (`CredentialsSignin`) |
| L17-07 | **PASS** | `ACTIVE` lagi: login berhasil (`302` ke dashboard) |
| L17-13 | **PASS** | Notifikasi tertarget: unread tenant A 22 → 23, tenant B tetap 50 |
| L17-14 | **PASS** | Broadcast: 8 akun, notifikasi muncul sebagai item terbaru di A dan B |
| L17-15 | **PASS** | Badge lonceng berubah 24 → 25 **tanpa muat ulang halaman** saat notifikasi dikirim |
| L17-20 | **belum terbukti** | `href` tersimpan benar (`/dashboard/billing`) dan item tampil di panel, tetapi klik otomatis saya tidak memicu navigasi — perlu dicoba manual |

## Catatan yang perlu diingat

1. **Mengubah langganan, role, status, email, atau kata sandi selalu mematikan
   sesi pengguna itu.** Ini perilaku yang benar, tetapi saat menguji berarti
   sesi tenant harus dibuat ulang setiap kali.
2. **Notifikasi broadcast masih tersisa di 5 akun lain** (akun pemilik sendiri:
   `yusuf.edubisnet`, `rayyan2709.gamer`, `rayyan.a.alfatih`,
   `admin@kingofcoding`, `rayyan@kingofcoding`). Untuk A dan B sudah dihapus.
   Tidak berbahaya dan bisa dihapus sendiri dari lonceng.
3. Tombol **Reject** juga memakai endpoint yang sama, jadi perbaikan `8ec211f`
   menutup kedua jalur (approve dan reject).

---

# L17-20 — PASS (uji manual pemilik, 29 Okt 2026 19:2x WIB)

Notifikasi `uji-L17-20 klik manual` (href `/dashboard/billing`) diklik langsung
oleh pemilik di browser. Hasilnya: aplikasi berpindah ke halaman Tagihan sesuai
`href`. Halaman memang lambat karena masalah performa yang dibahas di
`docs/qa/DIAGNOSA-LAMBAT-2026-10-29.md`, tetapi navigasinya benar.

Catatan: klik otomatis lewat alat browser tidak memicu navigasi, sedangkan klik
manusia berhasil — jadi untuk tes semacam ini, verifikasi manual memang lebih
akurat. Notifikasi ujinya sudah dihapus.
