# Laporan Perubahan — 31 Oktober 2026

Ringkasan lima permintaan dan hasilnya. Ditulis untuk pemilik produk, bukan hanya developer.

## 1. Paket trial

**Sebelumnya ada.** Akun baru otomatis mendapat `plan_trial` selama 7 hari dengan batas kecil (500 pesan, 1 perangkat, 2 broadcast, 1 webhook, 100 MB media).

**Sekarang dihapus.**

- `plan_trial` dinonaktifkan dan tidak bisa diberikan lagi.
- Akun baru masuk paket **Belum aktif** (`plan_pending`): semua fitur terkunci, tetapi dashboard dan halaman Billing tetap bisa dibuka.
- Pengiriman, auto-reply, webhook, dan upload baru aktif setelah pembayaran disetujui.
- Pelanggan trial lama dipindahkan ke **Belum aktif** dan harus memilih paket.

Alasan: setiap perangkat WhatsApp yang terhubung memakai RAM dan koneksi. Trial gratis membuka biaya tanpa pendapatan, dan gateway gratis mudah disalahgunakan untuk spam.

## 2. Halaman register

Halaman register sekarang memakai gaya yang sama dengan login:

- Latar `--pp-paper`, kartu putih bergaris `--pp-ink`.
- Judul dan subjudul yang sama.
- Input, tombol, dan pesan error yang sama.
- Tanpa gradient, glassmorphism, atau ikon dekoratif.
- Tetap mempertahankan aturan kata sandi dan konfirmasi kata sandi.

## 3. Batas upload per paket

| Paket | Maksimal per file | Penyimpanan |
| --- | --- | --- |
| Starter | 50 MB | 1 GB |
| Bisnis | 75 MB | 5 GB |
| Pro | 100 MB | 20 GB |

Batas per file naik mengikuti paket: 50 MB, 75 MB, dan 100 MB. Angka 100 MB adalah plafon karena itu batas maksimum dokumen yang masih bisa dikirim WhatsApp. Pembeda lain adalah ruang penyimpanan, jumlah pesan, perangkat, dan kuota fitur.

Batas ditegakkan di server, bukan hanya di tampilan. Dashboard juga menampilkan batas paket dan menolak file terlalu besar sebelum upload.

Catatan penting: WhatsApp sendiri membatasi video 16 MB dan dokumen 100 MB. Video tetap perlu dikompres ke bawah 16 MB agar bisa dikirim, berapa pun paketnya.

## 4. Paket dan harga baru

| | Starter | Bisnis | Pro |
| --- | --- | --- | --- |
| Bulanan | Rp20.000 | Rp49.000 | Rp99.000 |
| Tahunan (10×) | Rp200.000 | Rp490.000 | Rp990.000 |
| Perangkat | 1 | 3 | 5 |
| Pesan/bulan | 3.000 | 12.000 | 40.000 |
| Broadcast/bulan | 50 | 200 | 500 |
| Penerima/broadcast | 500 | 1.500 | 3.000 |
| Auto-reply | 10 | 50 | Tanpa batas |
| Webhook | 2 | 5 | 15 |
| Kunci API | 2 | 5 | 10 |
| Pesan terjadwal | 20 | 100 | Tanpa batas |
| Upload/file | 50 MB | 75 MB | 100 MB |
| Storage | 1 GB | 5 GB | 20 GB |
| Jeda minimum | 5 dtk | 3 dtk | 2 dtk |

Harga per pesan: Starter Rp6,67; Bisnis Rp4,08; Pro Rp2,48. Pembanding Fonnte termurah (Rp25.000/1.000 pesan) sekitar Rp25 per pesan, jadi PesanPro 3,7–10× lebih murah per pesan.

### Margin

Dengan asumsi VPS Rp250.000/bulan, 25 sesi per VPS, domain dan backup Rp50.000/bulan:

| Pelanggan | Pendapatan | Laba | Margin |
| --- | --- | --- | --- |
| 20 | Rp890.000 | Rp328.000 | 36,9% |
| 50 | Rp2.225.000 | Rp895.000 | 40,2% |
| 100 | Rp4.450.000 | Rp1.840.000 | 41,3% |

Pada kepadatan 20 sesi/VPS, margin turun menjadi 9–30%. Titik impas 7–20 pelanggan, tergantung kepadatan.

Rekomendasi: jaga 25 sesi/VPS, dorong paket Bisnis, jual tahunan untuk arus kas, dan jangan menambah perangkat gratis. Kalau butuh margin lebih tebal, tambah add-on perangkat Rp10.000–15.000/bulan atau naikkan Starter ke Rp25.000 setelah ada 30 pelanggan.

Hitungan lengkap: `docs/panduan/09-paket-dan-margin.md`.

## 5. Dokumentasi

Dokumentasi baru ada di `docs/panduan/`:

| File | Isi |
| --- | --- |
| `README.md` | Indeks dan istilah |
| `01-memulai-umkm.md` | Daftar, bayar, hubungkan WhatsApp, kirim pesan pertama |
| `02-broadcast.md` | Broadcast dashboard, CSV, variabel, spintax, opt-in, suppression |
| `03-auto-reply.md` | Semua jenis aturan, prioritas, jadwal, cooldown, 8 contoh |
| `04-media-dan-limit-upload.md` | Format, batas paket, kompresi, batas WhatsApp |
| `05-api-developer.md` | Auth, scope, idempotency, endpoint, cURL/Node/PHP, SDK mini |
| `06-webhook.md` | Event, payload, signature, retry, verifikasi Node/PHP |
| `07-integrasi-tanpa-kode.md` | WordPress/CF7, WooCommerce, Google Forms |
| `08-troubleshooting-faq.md` | Error umum dan langkah perbaikan |
| `09-paket-dan-margin.md` | Matriks, biaya, margin, titik impas |
| `10-panduan-admin.md` | Verifikasi pembayaran, paket, override, operasional |

## 6. UI halaman Tagihan

Halaman Tagihan ditulis ulang dengan bahasa yang lebih mudah dipahami:

- Kartu paket menampilkan harga besar, harga tahunan, hemat, dan 5 manfaat utama dalam bahasa awam.
- Bagian "Kirim bukti pembayaran" menjelaskan tiga langkah: transfer, unggah bukti, tunggu persetujuan.
- Nominal bisa disalin, dan ada checklist sebelum tombol aktif.
- Riwayat pembayaran memakai status Indonesia: Menunggu pemeriksaan, Disetujui, Ditolak, Dibatalkan.
- Pemakaian menampilkan 3 metrik utama dengan progress bar, plus detail semua batas paket.
- Kalau akun belum punya data langganan, halaman tetap menampilkan pilihan paket (tidak lagi kosong total).
- Keterangan hemat tahunan dihitung dari harga paket yang dipilih, bukan angka tetap.
- Di kotak nominal ada pengingat untuk menanyakan nomor rekening tujuan ke admin sebelum transfer.

Catatan: angka 75.000/149.000/299.000 di screenshot berasal dari data lama di database. Setelah `prisma migrate deploy`, kartu otomatis menampilkan 20.000/49.000/99.000.

## Yang perlu dilakukan saat deploy

1. Backup database.
2. `git pull`
3. `npm ci`
4. `npx prisma migrate deploy`
5. `npx prisma generate`
6. `npm run build`
7. `pm2 restart pesanpro`
8. Naikkan `client_max_body_size` Nginx ke minimal `105m`.
9. Uji: daftar akun baru → pastikan masuk **Belum aktif** → kirim bukti bayar → approve → hubungkan perangkat → kirim pesan.

## Risiko dan catatan

- **Pelanggan trial lama langsung terputus.** Kalau ada pelanggan nyata di status `TRIAL`, hubungi mereka sebelum migrasi.
- **Batas pesan turun.** Pelanggan lama di paket Starter yang biasa memakai 10.000 pesan akan terkena batas 3.000 pada periode berikutnya.
- **Build lokal sempat gagal** karena pengaman penghapusan `.next`, bukan karena kode. Direktori lama dipindahkan ke `.next.old-*`.
- **Build produksi lokal 31 Okt 11.20 gagal karena memori Windows** (sisa commit hanya 3,1 GB), bukan karena kode. `tsc --noEmit` dan `eslint` lulus; build terakhir yang sukses memakai heap 2 GB. Jalankan `npm run build` di VPS sebagai gate akhir.
- **Sisa audit dependensi:** 31 temuan high, sebagian besar di tooling development (vite/vitest/eslint) dan `zod` bawaan `jimp`. Zod utama sudah dinaikkan ke 4.6.7; jimp belum bisa tanpa downgrade besar.
- **`pure/`** adalah salinan repo untracked. Typecheck sekarang mengecualikannya agar tidak membaca kode lama.

## Hasil pemeriksaan

- Typecheck: lulus.
- Lint: lulus.
- Test: 420 lulus.
- Build produksi: lulus.
- `git diff --check`: lulus.
- `npm audit`: 52 temuan (21 moderate, 31 high), mayoritas tooling development.
