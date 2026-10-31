# Blog: Notifikasi Order WhatsApp Otomatis untuk Toko Online

## FAKTA

- Artikel lama: `https://pesanpro.kingofcoding.my.id/blog/notifikasi-order-wa-toko-online` (13 Oktober 2026).
- Artikel lama tidak memuat harga, trial, atau klaim privasi.
- Perubahan: CTA "Daftar", tautan harga, tautan dokumentasi API, dan penegasan bahwa webhook menerima event `message.received`.
- Materi menunggu deploy v0.2.0 karena tautan harga dan alur daftar.

## DRAF

> **Status: DRAF.** Siap menggantikan artikel lama setelah v0.2.0 live.

**URL:** `/blog/notifikasi-order-wa-toko-online`
**Meta title:** Notifikasi Order WhatsApp Otomatis untuk Toko Online | PesanPro
**Meta description:** Cara membuat notifikasi order WhatsApp otomatis untuk toko online: momen yang perlu dikirim, isi pesan yang jelas, dan cara menghindari laporan spam.
**Keyword utama:** notifikasi order whatsapp otomatis

# Notifikasi order WhatsApp otomatis untuk toko online

Pertanyaan yang paling sering masuk ke toko online bukan soal produk. Yang paling sering adalah "pesanan saya sudah dikirim belum?". Pertanyaan itu muncul karena pelanggan tidak tahu status pesanannya. Notifikasi WhatsApp otomatis menutup celah itu.

## Momen yang paling layak dikirim notifikasi

Tidak semua perubahan status perlu dikabarkan. Tiga momen ini yang biasanya paling berguna:

- Pesanan diterima dan sedang diproses.
- Paket diserahkan ke jasa kirim, lengkap dengan nomor resi.
- Pesanan sampai di tujuan.

Kalau Anda mengirim notifikasi di setiap perubahan status, pelanggan akan berhenti membacanya.

## Alur kerjanya

Sistem toko Anda sudah punya kejadian, misalnya pesanan baru masuk. Dari kejadian itu, alurnya begini:

1. Toko membuat pesanan dan mencatat nomornya.
2. Backend mengirim permintaan ke gateway WhatsApp.
3. Gateway meneruskan pesan ke pelanggan.
4. Kalau pengiriman gagal, gateway mengirim webhook supaya Anda bisa mencoba ulang.

Kalau notifikasi dibuat dari kode backend, jangan menaruh kunci API di halaman toko. Panggil lewat server.

## Isi pesan yang berguna

Notifikasi yang baik menjawab tiga hal dalam sekali baca:

- Pesanan yang mana. Sertakan nomor pesanan.
- Statusnya apa sekarang.
- Apa yang perlu dilakukan pelanggan, kalau ada.

Contoh: "Pesanan #1024 sudah dikirim. Resi JNE1234567890. Lacak di [tautan]."

## Menghindari laporan spam

Beberapa hal yang membuat notifikasi transaksional tetap diterima dengan baik:

**Kirim hanya ke pelanggan yang benar-benar bertransaksi.** Notifikasi promosi ke daftar nomor yang tidak pernah membeli adalah cara tercepat masuk daftar blokir.

**Jangan kirim terlalu banyak.** Satu pesan per momen penting sudah cukup.

**Sediakan cara berhenti.** Beberapa pelanggan tidak ingin menerima notifikasi, dan permintaan mereka harus dihormati.

## Menyambungkan ke sistem toko Anda

Sebagian besar platform toko online bisa memanggil alamat web saat ada pesanan baru. Dari alamat itu, backend Anda mengirim pesan lewat gateway. Tidak perlu menunggu fitur khusus dari platform.

Kalau toko masih dicatat manual, mulai dari yang sederhana: kirim notifikasi resi secara manual dari dashboard, lalu otomatiskan setelah alurnya terasa pas.

## Berapa biayanya?

Notifikasi order masuk ke kuota pesan paket Anda. Starter Rp20.000 per bulan sudah mendapat 3.000 pesan, Bisnis Rp49.000 mendapat 12.000 pesan, dan Pro Rp99.000 mendapat 40.000 pesan.

Lihat rincian batas paket di [halaman harga](/harga).

## Langkah berikutnya

- Pelajari [cara mengirim WhatsApp otomatis dari website](/blog/kirim-wa-otomatis-dari-website).
- Baca [API untuk developer](/docs/05-api-developer) untuk contoh cURL, Node.js, dan PHP.
- Siapkan balasan otomatis untuk pertanyaan status pesanan di [auto-reply](/docs/03-auto-reply).

**Tombol:** Daftar

## TODO

- Ganti artikel lama di CMS, bukan menambah artikel baru.
- Pastikan tautan `/harga` dan `/docs/03-auto-reply` aktif setelah deploy.
- Konfirmasi CTA "Daftar" ke https://wagateway.kingofcoding.my.id/auth/register.
- Verifikasi ulang nama field webhook sebelum menambah contoh payload.
