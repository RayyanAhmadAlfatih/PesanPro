# 10 — Panduan admin

Panduan ini untuk **SUPERADMIN** yang mengelola platform: menyetujui pembayaran, mengatur paket, memberi override, dan memantau kesehatan sistem.

## Masuk sebagai superadmin

1. Buka `https://wagateway.kingofcoding.my.id/auth/login`.
2. Masuk dengan akun superadmin.
3. Sidebar menampilkan menu tambahan: **Users**, **Commercial**, **Settings**, **System Monitor**, **Announcements**, **Notifications**.

Akun `USER` tidak bisa membuka menu tersebut. Kalau muncul 403, periksa role akun di database.

## Alur kerja harian

```
Cek pembayaran masuk
   → verifikasi nominal & bukti
   → setujui / tolak
   → cek perangkat dan antrean
   → cek alert operasional
   → catat hal yang perlu ditindaklanjuti
```

## 1. Verifikasi pembayaran

Buka **Commercial** → bagian **Payment verification**.

Setiap baris menampilkan:

- Nama dan email pelanggan.
- Paket yang dipilih.
- Nominal dan periode (bulanan/tahunan).
- Referensi pembayaran.
- Bukti (link).
- Status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.

### Yang harus diperiksa

1. **Nominal** sama dengan harga paket × periode.
2. **Nama pengirim** wajar (tidak harus sama persis).
3. **Bukti** jelas, tidak terpotong, bukan hasil edit.
4. **Tanggal transfer** masuk akal.
5. **Referensi** cocok dengan yang diisi pelanggan.
6. **Tidak ada duplikat** untuk periode yang sama.

### Menyetujui

Klik **Approve**. Sistem akan:

- Mengubah status pembayaran menjadi `APPROVED`.
- Membuat atau memperbarui subscription pelanggan.
- Mengaktifkan paket selama 1 bulan atau 12 bulan sesuai periode.
- Menyesuaikan batas perangkat.
- Mengirim email konfirmasi.
- Mencatat audit log.

### Menolak

Klik **Reject** dan isi catatan yang bisa dibaca pelanggan. Contoh:

```
Nominal transfer Rp49.000, sedangkan paket Bisnis bulanan Rp49.000 + kode unik Rp123.
Silakan transfer sesuai nominal dan unggah ulang bukti.
```

Catatan ini muncul di riwayat pembayaran pelanggan.

### Kalau approve gagal

Gejala: error 500, tetapi data pembayaran berubah.

Periksa log server. Penyebab yang pernah terjadi: nilai entitlement bertipe `BigInt` tidak bisa diserialisasi ke JSON setelah transaksi commit. Perbaikannya ada di `serializePaymentVerification`, bukan di data pelanggan.

Kalau transaksi sudah commit, jangan approve ulang. Periksa subscription pelanggan; kalau sudah aktif, cukup perbaiki respons API.

## 2. Mengelola paket

Buka **Commercial** → **Create plan** atau daftar **Plans**.

Field penting:

| Field | Catatan |
| --- | --- |
| Code | Huruf besar, unik, 2–32 karakter |
| Name | Nama yang dilihat pelanggan |
| Monthly price | Harga bulanan dalam rupiah, tanpa titik |
| Yearly price | Harga tahunan; kosongkan kalau tidak dijual |
| Entitlements | Batas fitur |

Aturan:

- **Satu plan default.** Plan default dipakai untuk akun baru. Saat ini `plan_pending` (Belum aktif).
- **Jangan menonaktifkan plan default** tanpa menggantinya. Registrasi akan gagal dengan "No active default plan is configured".
- **Jangan menghapus plan** yang punya subscription. Nonaktifkan saja.
- **Harga tahunan bukan harga bulanan × 12.** Isi angka sebenarnya.

### Plan yang ada

| ID | Code | Fungsi |
| --- | --- | --- |
| `plan_pending` | `PENDING` | Default akun baru, semua fitur terkunci |
| `plan_starter` | `STARTER` | Paket berbayar Rp20.000 |
| `plan_bisnis` | `BISNIS` | Paket berbayar Rp49.000 |
| `plan_pro` | `PRO` | Paket berbayar Rp99.000 |
| `plan_trial` | `TRIAL` | **Dihentikan.** Jangan diaktifkan kembali |

`plan_trial` masih ada karena riwayat subscription menunjuk ke sana, tetapi `isActive = false` dan tidak bisa dipakai.

### Mengubah harga

1. Buka daftar plan.
2. Ubah harga bulanan/tahunan.
3. Simpan.

Perubahan harga **tidak** mengubah pembayaran yang sudah disetujui. Pelanggan lama tetap memakai periode yang sudah dibayar. Perubahan berlaku pada pembayaran berikutnya.

Kalau ingin mengubah batas fitur, lakukan di bagian entitlement. Perubahan langsung berlaku untuk semua pelanggan di plan tersebut, termasuk yang sedang berjalan.

## 3. Assign subscription manual

Gunakan untuk:

- Pelanggan yang membayar di luar sistem.
- Kompensasi gangguan layanan.
- Akun uji internal.
- Migrasi pelanggan lama.

Langkah:

1. Buka **Commercial** → **Assign subscription**.
2. Pilih pelanggan.
3. Pilih plan.
4. Pilih status:
   - `ACTIVE` — aktif normal.
   - `GRACE_PERIOD` — masa tenggang.
   - `EXPIRED` — kedaluwarsa.
   - `SUSPENDED` — ditangguhkan.
   - `CANCELLED` — dibatalkan.
5. Isi **Ends at** dan **Grace ends at** kalau perlu.
6. Isi **Audit reason** minimal 3 karakter. Contoh: `manual transfer BCA 2026-10-31`.
7. Klik **Apply subscription**.

Sistem akan mencatat riwayat subscription dan menyesuaikan batas perangkat.

> **Jangan memilih `TRIAL`.** Status itu sudah tidak tersedia di UI dan ditolak API.

## 4. Entitlement override

Override memberi pengecualian pada satu tenant tanpa mengubah plan global. Gunakan untuk:

- Memberi kuota tambahan sementara.
- Menutup fitur karena penyalahgunaan.
- Menyesuaikan batas perangkat untuk pelanggan khusus.

Field:

| Field | Arti |
| --- | --- |
| Feature | Fitur yang di-override |
| Enabled | Aktif/nonaktif |
| Limit | Batas baru; kosongkan untuk tanpa batas |
| Expires at | Tanggal berakhir; kosong = permanen |
| Reason | Alasan, wajib |

Contoh:

```
Feature: MESSAGES_MONTHLY
Enabled: true
Limit: 5000
Expires at: 2026-11-30
Reason: kompensasi gangguan 2026-10-30
```

Override yang kedaluwarsa otomatis diabaikan. Override aktif menang atas plan.

> **Hati-hati:** override `limit = 0` dengan `enabled = true` akan memblokir fitur sepenuhnya. Untuk memblokir, gunakan `enabled = false`.

## 5. Memantau operasional

### System Monitor

Menampilkan:

- Kesehatan proses.
- Status worker.
- Antrean pesan, jadwal, broadcast, webhook.
- Penggunaan disk dan database.
- Heartbeat runtime.

Yang perlu diperiksa setiap hari:

1. Worker `message`, `schedule`, `broadcast`, `autoreply`, `webhook` hidup.
2. Tidak ada antrean `PROCESSING` yang menggantung terlalu lama.
3. Disk di bawah 80%.
4. Database merespons di bawah 500 ms.

### Alert

Alert dibuat otomatis untuk kondisi seperti:

- Antrean menua melewati ambang.
- Disk hampir penuh.
- Database lambat.
- Worker mati.

Tindak lanjuti alert, lalu tandai selesai. Jangan biarkan alert menumpuk; itu membuat alert baru tidak terlihat.

### Business snapshot

Dashboard admin menampilkan:

- Jumlah tenant dan tenant aktif bulanan.
- Pesan terkirim bulan ini.
- Perangkat total dan terhubung.
- Penyimpanan terpakai.
- Distribusi status subscription.
- Pendapatan berulang estimasi.
- Pembayaran disetujui bulan ini.
- Estimasi laba berdasarkan `MONTHLY_INFRA_COST_IDR`.

Isi `MONTHLY_INFRA_COST_IDR` dengan biaya VPS + domain + backup aktual. Kalau dibiarkan `0`, estimasi laba akan terlalu optimistis.

## 6. Mengelola pengguna

Menu **Users** menampilkan daftar akun.

Yang bisa dilakukan:

- Melihat status akun.
- Menonaktifkan akun yang melanggar.
- Melihat perangkat dan subscription.

Aturan:

- Jangan menghapus akun yang masih punya data aktif. Nonaktifkan dulu.
- Jangan mengubah email pelanggan tanpa permintaan tertulis.
- Setiap tindakan harus punya alasan yang dicatat.

## 7. Pengumuman

Menu **Announcements** mengirim popup ke dashboard pelanggan.

Gunakan untuk:

- Gangguan layanan.
- Perubahan harga.
- Fitur baru.
- Pengingat perpanjangan.

Aturan:

- Tulis singkat dan jelas.
- Sertakan tanggal berlaku.
- Jangan memakai pengumuman untuk promosi berlebihan.
- Uji di akun internal sebelum publish.

## 8. Audit log

Semua tindakan admin tercatat:

- Siapa yang melakukan.
- Kapan.
- Apa yang diubah.
- Alasan (kalau diisi).

Audit disimpan 365 hari. Gunakan untuk investigasi dan kepatuhan.

## 9. Deployment dan migrasi

### Sebelum deploy

1. Backup database.
2. Pastikan migration baru sudah diuji di staging.
3. Catat commit yang akan dipasang.
4. Siapkan rollback.

### Deploy

```bash
cd /www/wwwroot/PesanPro
git pull
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart pesanpro
```

> Runtime memakai `tsx src/server/index.ts`, jadi perubahan server-side dibaca dari `src/`, bukan `.next`. Deploy `.next` saja tidak cukup; tetap perlu `git pull` dan restart PM2.

### Setelah deploy

1. Cek `/api/health/live` dan `/api/health/ready`.
2. Cek log PM2 untuk error.
3. Cek satu pengiriman uji.
4. Cek satu webhook uji.
5. Cek halaman Billing dan Commercial.

### Migration paket baru

Migration `20261031000000_premium_plans_and_upload_limits` melakukan:

1. Menambah fitur `MEDIA_MAX_UPLOAD_BYTES`.
2. Membuat `plan_pending`.
3. Mengubah harga dan entitlement Starter/Bisnis/Pro.
4. Menonaktifkan `plan_trial`.
5. Memindahkan subscription trial ke `plan_pending`.
6. Menghapus kolom `trialDays`.

Setelah migrasi:

- Akun baru otomatis masuk `plan_pending`.
- Pelanggan trial lama harus memilih paket dan membayar.
- Pelanggan berbayar tetap di plan-nya, dengan batas baru.

**Periksa sebelum migrasi:** berapa pelanggan yang masih `TRIAL`. Kalau ada pelanggan nyata (bukan QA), hubungi mereka sebelum migrasi.

## 10. Checklist mingguan

- [ ] Semua pembayaran `PENDING` sudah ditinjau.
- [ ] Tidak ada alert kritis yang terbuka.
- [ ] Semua worker hidup.
- [ ] Antrean tidak menumpuk.
- [ ] Disk di bawah 80%.
- [ ] Backup terbaru berhasil diverifikasi.
- [ ] Tidak ada API key mencurigakan.
- [ ] Tidak ada tenant yang menyalahgunakan kuota.
- [ ] Harga dan paket di website sama dengan database.
- [ ] Dokumentasi diperbarui kalau ada perubahan fitur.

## 11. Tindakan darurat

### Nomor pelanggan diblokir WhatsApp

1. Minta pelanggan menghubungkan nomor baru.
2. Pindahkan perangkat yang masih memungkinkan.
3. Jangan mencoba bypass pemblokiran.
4. Catat kejadian.

### Kuota salah

1. Periksa `UsageCounter` dan `UsageLedger`.
2. Bandingkan dengan `MESSAGE` jobs.
3. Kalau ada kebocoran reservasi, gunakan override sementara.
4. Perbaiki akar masalah; jangan hanya menambah kuota.

### Webhook membanjiri pelanggan

1. Nonaktifkan endpoint bermasalah.
2. Periksa retry dan ukuran payload.
3. Minta pelanggan membalas `2xx` lebih cepat.
4. Aktifkan kembali setelah diperbaiki.

### Kebocoran API key

1. Cabut key di dashboard.
2. Buat key baru.
3. Periksa audit log dan penggunaan terakhir.
4. Beri tahu pelanggan.
5. Kalau perlu, nonaktifkan akun sementara.
