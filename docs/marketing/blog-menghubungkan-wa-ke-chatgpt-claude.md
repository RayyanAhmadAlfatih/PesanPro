# Blog: Menghubungkan WhatsApp ke ChatGPT atau Claude untuk Auto-reply

## FAKTA

- Artikel lama: `https://pesanpro.kingofcoding.my.id/blog/menghubungkan-wa-ke-chatgpt-claude-untuk-auto-reply` (13 Oktober 2026).
- Artikel lama tidak memuat harga, trial, atau klaim privasi.
- Perubahan: CTA "Daftar", tautan harga, penegasan event webhook `message.received`, dan catatan bahwa biaya model AI ditanggung pengguna.
- Materi menunggu deploy v0.2.0 karena tautan harga dan alur daftar.

## DRAF

> **Status: DRAF.** Siap menggantikan artikel lama setelah v0.2.0 live.

**URL:** `/blog/menghubungkan-wa-ke-chatgpt-claude-untuk-auto-reply`
**Meta title:** Menghubungkan WhatsApp ke ChatGPT atau Claude untuk Auto-reply | PesanPro
**Meta description:** Cara menyambungkan WhatsApp ke ChatGPT atau Claude untuk balas otomatis, lengkap dengan contoh prompt, alur webhook, dan batas yang perlu dijaga.
**Keyword utama:** whatsapp ke chatgpt

# Menghubungkan WhatsApp ke ChatGPT atau Claude untuk auto-reply

Nomor WhatsApp bisnis menerima pertanyaan yang berulang: harga, jam buka, cara pesan, status kirim. Sebagian besar bisa dijawab otomatis. Dengan menyambungkan WhatsApp ke model AI, pelanggan mendapat jawaban dalam hitungan detik, termasuk di luar jam kerja.

## Alur yang dipakai

Model AI tidak bisa membaca WhatsApp secara langsung. Yang menghubungkan keduanya adalah webhook dan API.

1. Pelanggan mengirim pesan ke nomor WhatsApp bisnis Anda.
2. Gateway meneruskan pesan itu ke server Anda lewat webhook.
3. Server Anda mengirim pesan dan konteksnya ke model AI.
4. Jawaban dari model dikirim kembali ke pelanggan lewat API gateway.

Server kecil di tengah ini yang menyimpan aturan Anda: apa yang boleh dijawab AI, dan kapan harus dialihkan ke manusia.

## Event webhook yang dipakai

Pesan masuk dikirim dengan event `message.received`. Field yang biasanya dipakai:

- `from`: nomor pengirim.
- `content`: isi pesan.
- `type`: jenis pesan.
- `isGroup`: apakah pesan berasal dari grup.

Server Anda membalas `2xx` dengan cepat, lalu memproses jawaban AI secara terpisah. Jangan menahan respons webhook sampai model selesai menjawab.

## Contoh prompt

Prompt menentukan kualitas jawaban. Contoh berikut bisa menjadi titik awal.

```
Kamu adalah asisten layanan pelanggan untuk toko kue rumahan "Dapur Ibu".
Jawab singkat, maksimal 3 kalimat, dalam Bahasa Indonesia yang ramah.
Informasi yang boleh kamu pakai:
- Kue dipesan minimal 2 hari sebelumnya.
- Kirim hanya dalam kota, jam 09.00 sampai 17.00.
- Pembayaran lewat transfer atau e-wallet.
Kalau pertanyaan di luar informasi itu, katakan bahwa kamu akan menghubungkan ke admin.
Jangan pernah menjanjikan diskon, tanggal pasti, atau harga di luar daftar.
```

Baris terakhir penting. Tanpa batas yang jelas, model bisa mengarang janji yang tidak bisa Anda tepati.

## Batas yang perlu dijaga

**Jangan biarkan AI mengarang fakta.** Tempelkan daftar informasi yang boleh dipakai, seperti contoh di atas. Kalau pertanyaan di luar daftar, alihkan ke manusia.

**Selalu sediakan jalan ke manusia.** Pelanggan yang kesal atau pertanyaannya rumit butuh orang, bukan bot. Beri kata kunci seperti "admin" untuk memicu pengalihan.

**Perhatikan biaya.** Setiap pesan yang diproses model punya biaya. Batasi panjang percakapan yang dikirim sebagai konteks, dan hentikan balasan otomatis untuk percakapan yang sudah lama.

**Uji dulu di nomor sendiri.** Sebelum dipakai pelanggan, coba berbagai pertanyaan, termasuk yang aneh dan yang bernada marah.

## Mulai dari lingkup kecil

Jangan langsung mengotomatiskan semua percakapan. Mulai dari satu jenis pertanyaan yang paling sering muncul, misalnya jam operasional. Setelah jawabannya konsisten bagus, tambah satu jenis lagi.

Cara ini membuat kesalahan lebih mudah ditemukan dan diperbaiki sebelum pelanggan merasakannya.

## Biaya WhatsApp dan biaya AI

Biaya WhatsApp masuk ke paket PesanPro. Starter Rp20.000 per bulan mendapat 3.000 pesan. Biaya model AI dibayar terpisah ke penyedia model yang Anda pilih, bukan ke PesanPro.

Rincian paket ada di [halaman harga](/harga).

## Langkah berikutnya

- Pelajari [webhook](/docs/06-webhook) untuk verifikasi tanda tangan dan retry.
- Lihat [API untuk developer](/docs/05-api-developer) untuk contoh pengiriman balasan.
- Baca [cara mengirim WhatsApp otomatis dari website](/blog/kirim-wa-otomatis-dari-website).

**Tombol:** Daftar

## TODO

- Ganti artikel lama di CMS, bukan menambah artikel baru.
- Pastikan tautan `/harga` dan `/docs/06-webhook` aktif setelah deploy.
- Konfirmasi CTA "Daftar" ke https://wagateway.kingofcoding.my.id/auth/register.
- Jangan menambahkan klaim bahwa PesanPro menyediakan model AI bawaan. Artikel ini memakai model AI pihak ketiga milik pembaca.
