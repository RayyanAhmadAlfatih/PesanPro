# Blog: Cara Mengirim WhatsApp Otomatis dari Website

## FAKTA

- Artikel lama: `https://pesanpro.kingofcoding.my.id/blog/kirim-wa-otomatis-dari-website` (13 Oktober 2026).
- Artikel lama tidak memuat harga, trial, atau klaim privasi. Perubahan utama: CTA, tautan harga, dan penyelarasan istilah.
- Endpoint, header, dan body sudah diverifikasi ke kode v0.2.0.
- Materi menunggu deploy v0.2.0 karena CTA mengarah ke alur daftar baru dan tautan /harga.

## DRAF

> **Status: DRAF.** Siap menggantikan artikel lama setelah v0.2.0 live.

**URL:** `/blog/kirim-wa-otomatis-dari-website`
**Meta title:** Cara Mengirim WhatsApp Otomatis dari Website | PesanPro
**Meta description:** Panduan mengirim WhatsApp otomatis dari website: beda tautan wa.me dan gateway API, contoh kode Node.js, serta kunci idempotency agar pesan tidak dobel.
**Keyword utama:** kirim whatsapp otomatis dari website

# Cara mengirim WhatsApp otomatis dari website

Pengunjung mengisi formulir di website, lalu menunggu balasan. Kalau Anda membalas satu per satu secara manual, sebagian dari mereka pergi sebelum sempat dibalas. Ada dua cara mengirim WhatsApp otomatis dari website, dan keduanya punya kegunaan berbeda.

## Cara pertama: tautan wa.me

Tautan `wa.me` membuka WhatsApp dengan pesan yang sudah terisi. Cocok kalau Anda hanya ingin memindahkan percakapan dari website ke WhatsApp.

Caranya mudah, tetapi ada satu kelemahan: pengunjung tetap harus menekan tombol kirim sendiri. Jadi ini belum benar-benar otomatis.

## Cara kedua: gateway API

Gateway API membuat server Anda bisa mengirim pesan langsung, tanpa campur tangan pengunjung. Ini yang dipakai kalau Anda ingin balasan benar-benar otomatis.

Alurnya tiga langkah:

1. Sambungkan nomor WhatsApp ke gateway lewat scan QR.
2. Simpan kunci API di server sebagai environment variable.
3. Kirim pesan dari kode backend saat ada kejadian, misalnya formulir terkirim.

## Contoh kirim pesan dari backend

Contoh berikut memakai Node.js. Anda butuh kunci API, ID perangkat dari dashboard, dan nomor tujuan.

```javascript
const res = await fetch('https://wagateway.kingofcoding.my.id/api/v1/messages/text', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.PESANPRO_API_KEY,
    // Wajib. Kunci unik per pesan supaya pengiriman ulang tidak menggandakan pesan.
    'idempotency-key': `order-${orderId}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sessionId: process.env.PESANPRO_SESSION_ID,
    recipient: '6281234567890',
    text: 'Terima kasih, pesanan Anda sudah kami terima.',
  }),
});

if (!res.ok) {
  const body = await res.json();
  console.error('Gagal kirim pesan:', body.error?.code ?? res.status);
}
```

Simpan kunci API di environment variable, bukan di dalam kode. Kode yang berjalan di browser bisa dibaca siapa saja yang membuka halaman itu.

Server membalas `202` karena pesan masuk antrean dulu, bukan langsung terkirim. Untuk tahu hasil akhirnya, panggil `GET /api/v1/messages/<ID>` dengan header `x-api-key` yang sama, lalu periksa statusnya.

### Kenapa idempotency-key penting

Koneksi bisa putus setelah server menerima permintaan, sebelum Anda sempat membaca balasannya. Kalau Anda mencoba kirim ulang tanpa kunci ini, pelanggan menerima pesan yang sama dua kali. Dengan `idempotency-key` yang sama, pengiriman ulang dikembalikan ke pesan yang sudah ada.

Kunci harus 8 sampai 128 karakter dan hanya memakai huruf, angka, titik, garis bawah, titik dua, atau tanda hubung.

## Tiga hal yang sering dilupakan

**Persetujuan penerima.** Kirim hanya ke nomor yang memang setuju menerima pesan. Mengirim ke nomor yang tidak pernah mendaftar membuat pesan dilaporkan sebagai spam.

**Jam kirim.** Pesan tengah malam jarang dibaca dan lebih sering dianggap gangguan. Tunda pengiriman ke jam kerja.

**Isi pesan yang jelas.** Sebutkan siapa pengirimnya dan apa yang perlu dilakukan penerima. Pesan yang hanya berbunyi "Terima kasih" tanpa konteks membuat penerima bertanya-tanya.

## Langkah berikutnya

Setelah pesan otomatis pertama berjalan, Anda bisa menambah balasan otomatis berdasarkan kata kunci dan jadwal pengiriman. Keduanya bisa diatur dari dashboard tanpa menulis kode tambahan.

- Lihat [harga dan batas paket](/harga).
- Pelajari [API untuk developer](/docs/05-api-developer).
- Ikuti [mulai cepat](/docs/mulai-cepat) untuk mengirim pesan pertama.

**Tombol:** Daftar

## TODO

- Ganti artikel lama di CMS, bukan menambah artikel baru di URL yang berbeda.
- Pastikan tautan `/harga` dan `/docs/mulai-cepat` sudah aktif setelah deploy.
- Konfirmasi CTA "Daftar" mengarah ke https://wagateway.kingofcoding.my.id/auth/register.
- Tambahkan meta description final saat implementasi.
