# Blog: Apa Itu WhatsApp Gateway

## FAKTA

- Artikel lama tidak ditemukan. URL yang dicoba: `/blog/apa-itu-whatsapp-gateway`, `/blog/whatsapp-gateway`. Keduanya 404.
- Blog index hanya menampilkan tiga artikel per 31 Oktober 2026.
- Materi ini adalah rekonstruksi, bukan pembaruan langsung dari artikel lama.
- Materi menunggu deploy v0.2.0 karena CTA dan tautan harga.

## DRAF

> **Status: DRAF.** Kalau artikel lama ternyata ada di URL lain, bandingkan dulu. Jangan publish dua artikel dengan topik yang sama.

**URL usulan:** `/blog/apa-itu-whatsapp-gateway`
**Meta title:** Apa Itu WhatsApp Gateway dan Bagaimana Cara Kerjanya? | PesanPro
**Meta description:** Penjelasan apa itu WhatsApp gateway: cara kerja, bedanya dengan tautan wa.me, fungsi API dan webhook, serta hal yang perlu dicek sebelum memilih layanan.
**Keyword utama:** apa itu whatsapp gateway

# Apa itu WhatsApp gateway?

WhatsApp gateway adalah layanan yang menghubungkan nomor WhatsApp bisnis ke aplikasi lain. Dengan gateway, pesan bisa dikirim dari dashboard, toko online, atau sistem kasir tanpa harus mengetik di ponsel satu per satu.

Gateway bekerja sebagai perantara. Aplikasi Anda mengirim perintah, gateway meneruskannya ke WhatsApp, lalu mengembalikan status pengiriman.

## Bagaimana cara kerjanya?

Alurnya terdiri dari tiga bagian: nomor WhatsApp, gateway, dan aplikasi Anda.

1. Nomor WhatsApp dihubungkan ke gateway, biasanya dengan memindai kode QR.
2. Aplikasi Anda mengirim permintaan ke gateway lewat API.
3. Gateway meneruskan pesan ke WhatsApp dan mencatat statusnya.
4. Kalau ada pesan masuk, gateway mengirim pemberitahuan ke alamat webhook Anda.

API adalah cara program mengirim perintah. Webhook adalah pemberitahuan otomatis yang dikirim gateway saat ada kejadian, misalnya pesan masuk atau status pengiriman berubah.

## Bedanya dengan tautan wa.me

Tautan `wa.me` membuka WhatsApp dengan pesan yang sudah terisi. Pengunjung tetap harus menekan tombol kirim.

Gateway mengirim pesan tanpa campur tangan manusia. Ini yang dibutuhkan kalau Anda ingin notifikasi otomatis, balasan otomatis, atau pengiriman massal yang terjadwal.

| | Tautan wa.me | WhatsApp gateway |
| --- | --- | --- |
| Siapa yang menekan kirim | Pengunjung | Sistem |
| Cocok untuk | Tombol "Chat via WhatsApp" | Notifikasi, broadcast, auto-reply |
| Butuh kode | Tidak | Ya, untuk integrasi API |
| Bisa dijadwalkan | Tidak | Ya |
| Bisa menerima webhook | Tidak | Ya |

## Siapa yang membutuhkan gateway?

**Toko online.** Mengirim notifikasi pesanan, resi, dan status pembayaran tanpa mengetik manual.

**Layanan pelanggan.** Membalas pertanyaan berulang dengan aturan kata kunci.

**Tim marketing.** Mengirim pengumuman ke pelanggan yang sudah setuju menerima pesan.

**Pengembang aplikasi.** Menghubungkan WhatsApp ke sistem internal, CRM, atau layanan AI.

Kalau Anda hanya butuh tombol chat di website dan membalas manual, tautan `wa.me` sudah cukup.

## Yang perlu dicek sebelum memilih gateway

**Koneksi nomor.** Pastikan gateway mendukung scan QR dan menunjukkan status koneksi dengan jelas.

**Batas paket.** Perhatikan jumlah perangkat, pesan per bulan, broadcast, dan ukuran file. Batas ini menentukan biaya sebenarnya.

**API dan webhook.** Kalau Anda punya sistem sendiri, pastikan ada dokumentasi yang jelas dan contoh kode.

**Keamanan kunci API.** Kunci harus bisa dibatasi scope dan dirotasi. Jangan memakai layanan yang meminta kunci ditempel di kode frontend.

**Kebijakan WhatsApp.** Tidak ada gateway yang bisa menjamin nomor bebas blokir. Pilih layanan yang menyediakan jeda pengiriman dan mendorong praktik opt-in.

## Berapa biayanya?

PesanPro memakai harga bulanan: Starter Rp20.000, Bisnis Rp49.000, Pro Rp99.000. Tahunan dihitung 10x bulanan, jadi Anda membayar 10 bulan untuk 12 bulan pemakaian.

Semua paket mendapat fitur yang sama. Yang berbeda adalah batas perangkat, pesan, broadcast, dan penyimpanan. Rincian lengkap ada di [halaman harga](/harga).

## Cara mulai

1. Daftar dan pilih paket.
2. Transfer ke rekening tujuan yang tampil di halaman daftar, lalu unggah bukti.
3. Tunggu admin menyetujui pembayaran.
4. Hubungkan WhatsApp lewat QR.
5. Kirim pesan pertama dari dashboard atau API.

Panduan langkah demi langkah ada di [mulai cepat](/docs/mulai-cepat).

## Pertanyaan umum

**Apakah WhatsApp gateway resmi dari WhatsApp?**
Tidak selalu. PesanPro bukan layanan resmi WhatsApp atau Meta. Layanan ini menghubungkan nomor Anda ke WhatsApp dan memakai koneksi atas nama Anda.

**Apakah nomor saya bisa diblokir?**
Risikonya ada, terutama kalau Anda mengirim pesan massal tanpa persetujuan. Gunakan opt-in, jeda pengiriman, dan berhenti mengirim ke nomor yang meminta berhenti.

**Apakah harus bisa coding?**
Tidak. Dashboard bisa dipakai tanpa kode. Kode diperlukan kalau Anda ingin menghubungkan sistem lain lewat API.

**Apakah bisa dipakai beberapa nomor?**
Bisa. Starter 1 nomor, Bisnis 3 nomor, Pro 5 nomor.

**Apakah ada trial?**
Tidak. PesanPro berbayar sejak awal.

**Tombol:** Daftar

## TODO

- Cari artikel lama "apa itu WhatsApp gateway" di CMS. Kalau ada, gunakan sebagai basis dan jangan membuat URL duplikat.
- Pastikan `/harga` dan `/docs/mulai-cepat` aktif setelah deploy.
- Konfirmasi CTA "Daftar" ke https://wagateway.kingofcoding.my.id/auth/register.
- Tambahkan meta description final saat implementasi.
