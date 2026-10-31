# Landing Page (/)

## FAKTA

- Produk: WhatsApp Gateway untuk UMKM. Menghubungkan nomor lewat scan QR, mengirim pesan lewat dashboard atau REST API, menerima webhook, dan billing manual.
- Harga v0.2.0: Starter Rp20.000, Bisnis Rp49.000, Pro Rp99.000 per bulan. Tahunan 10x bulanan.
- Akun baru berstatus PENDING. Dashboard dan Tagihan bisa dibuka, tetapi pengiriman, auto-reply, webhook, dan upload media aktif setelah pembayaran disetujui admin.
- Pendaftaran sekaligus memilih paket dan mengunggah bukti transfer. Rekening tujuan tampil di halaman daftar.
- Fitur yang masih ada: broadcast, auto-reply, pesan terjadwal, webhook, API, beberapa perangkat, media.
- Fitur yang sudah dihapus: Chat UI, Label, Campaign.
- Tidak ada trial, paket gratis, atau lifetime.
- Materi ini menunggu deploy v0.2.0. Harga dan alur daftar baru belum berlaku di produksi sebelum deploy dan migrasi.

## DRAF

> **Status: DRAF.** Siap tempel setelah deploy v0.2.0. Jangan publish selama produksi masih memakai harga lama.

### Hero

**H1:** WhatsApp untuk bisnis, dikelola dari satu tempat

**Subjudul:** Hubungkan nomor WhatsApp lewat QR, lalu kirim notifikasi, broadcast, dan balasan otomatis dari dashboard atau sistem Anda sendiri.

**Tombol utama:** Daftar
**Tautan kedua:** Lihat harga

*Catatan untuk desainer: tombol "Daftar" mengarah ke https://wagateway.kingofcoding.my.id/auth/register. Jangan memakai teks "Mulai Gratis".*

### Masalah yang dialami UMKM

- Balasan pelanggan menumpuk karena harus diketik satu per satu.
- Pembeli bertanya "pesanan saya sudah dikirim belum?" karena tidak ada notifikasi otomatis.
- Broadcast dikirim manual, satu nomor demi satu nomor.
- Sistem toko online tidak terhubung ke WhatsApp, jadi notifikasi harus disalin manual.
- Nomor bisnis dan nomor pribadi bercampur, sulit dipisahkan.

### Solusi PesanPro

PesanPro menghubungkan nomor WhatsApp bisnis Anda ke satu dashboard. Dari sana Anda bisa mengirim pesan, menjadwalkan pengiriman, membalas otomatis berdasarkan kata kunci, dan menghubungkan toko online lewat API.

Untuk tim yang punya sistem sendiri, PesanPro menyediakan REST API dan webhook. API adalah cara program mengirim perintah ke PesanPro. Webhook adalah pesan otomatis yang dikirim PesanPro ke alamat yang Anda daftarkan saat ada kejadian, misalnya pesan masuk.

### Tiga langkah mulai

1. **Daftar, pilih paket, dan bayar.**
   Isi data akun, pilih paket dan periode, lalu transfer ke rekening tujuan yang tampil di halaman daftar. Unggah bukti transfer maksimal 5 MB. Akun berstatus PENDING sampai admin menyetujui pembayaran.

2. **Hubungkan WhatsApp lewat QR.**
   Setelah pembayaran disetujui, masuk ke dashboard dan pindai QR dari ponsel. Satu nomor cukup untuk mulai. Paket yang lebih besar bisa menampung lebih banyak nomor.

3. **Kirim pesan pertama.**
   Kirim dari dashboard, atau panggil API dari sistem Anda. Untuk pesan pertama lewat API, ikuti panduan mulai cepat di halaman dokumentasi.

### Fitur utama

**Notifikasi otomatis**
Kirim update pesanan, status pembayaran, atau nomor resi tanpa mengetik ulang. Sistem Anda memanggil API saat ada kejadian.

**Broadcast**
Kirim satu pesan ke banyak penerima dengan jeda otomatis. Cocok untuk pengumuman stok baru, promo, atau info jam operasional.

**Balasan otomatis**
Tentukan kata kunci dan balasannya. Pelanggan yang mengetik "harga" atau "jam buka" langsung mendapat jawaban, termasuk di luar jam kerja.

**Webhook**
Sistem Anda menerima pemberitahuan saat ada pesan masuk atau status pengiriman berubah. Cocok untuk menghubungkan WhatsApp ke aplikasi kasir, toko online, atau layanan lain.

**REST API**
Kirim pesan dari aplikasi apa pun yang bisa memanggil HTTP. Tersedia contoh cURL, Node.js, dan PHP di dokumentasi.

**Pesan terjadwal**
Siapkan pesan sekarang, kirim pada waktu yang Anda tentukan.

### Harga

| Paket | Bulanan | Tahunan (10x bulanan) | Perangkat | Pesan/bulan |
| --- | --- | --- | --- | --- |
| Starter | Rp20.000 | Rp200.000 | 1 | 3.000 |
| Bisnis | Rp49.000 | Rp490.000 | 3 | 12.000 |
| Pro | Rp99.000 | Rp990.000 | 5 | 40.000 |

Semua paket mendapat fitur yang sama. Yang berbeda adalah batas pemakaian. Pembayaran dilakukan lewat transfer manual, lalu admin memverifikasi bukti transfer.

**Tombol:** Lihat harga lengkap

### FAQ

**Apakah ada paket gratis atau trial?**
Tidak. PesanPro berbayar sejak awal. Akun baru aktif setelah pembayaran disetujui admin.

**Saya tidak bisa coding. Apakah tetap bisa memakai PesanPro?**
Bisa. Dashboard dipakai lewat klik, tanpa menulis kode. API hanya diperlukan kalau Anda ingin menghubungkan sistem lain.

**Berapa lama akun aktif setelah transfer?**
Akun berstatus PENDING sampai admin memeriksa bukti transfer. Setelah disetujui, paket langsung aktif dan Anda bisa menghubungkan WhatsApp.

**Apakah saya perlu nomor WhatsApp baru?**
Disarankan memakai nomor khusus usaha. Nomor pribadi bisa dipakai, tetapi lebih rawan tercampur dengan percakapan pribadi.

**Apakah nomor saya dijamin aman dari blokir WhatsApp?**
Tidak ada layanan yang bisa menjamin itu. PesanPro menyediakan jeda otomatis dan batas pengiriman untuk menurunkan risiko. Anda tetap perlu mengikuti aturan WhatsApp, termasuk hanya mengirim ke nomor yang setuju menerima pesan.

**Berapa nomor WhatsApp yang bisa dihubungkan?**
Starter 1 nomor, Bisnis 3 nomor, Pro 5 nomor.

### CTA penutup

**Judul:** Siap memindahkan WhatsApp bisnis ke satu tempat?

**Isi:** Daftar, pilih paket, dan unggah bukti transfer. Setelah disetujui, hubungkan nomor lewat QR dan kirim pesan pertama.

**Tombol:** Daftar

## TODO

- Konfirmasi ulang harga 20/49/99 sebelum publish.
- Deploy v0.2.0 dan jalankan migrasi database. Selama belum, halaman ini tidak boleh menggantikan situs lama.
- Ganti seluruh materi lama yang masih menampilkan Rp75.000/Rp149.000/Rp299.000, trial, Label, dan klaim privasi.
- Keputusan pemilik soal klaim privasi. Materi ini sengaja tidak memakai klaim "tidak menyimpan pesanmu".
- Pastikan tautan /harga dan /docs sudah tersedia di situs marketing.
- Tambahkan meta title dan meta description final saat implementasi.
