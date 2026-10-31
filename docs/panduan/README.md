# Panduan PesanPro

Dokumentasi ini ditulis untuk dua pembaca sekaligus:

- **Pemilik usaha (UMKM)** yang ingin memakai PesanPro lewat dashboard, tanpa menulis kode.
- **Developer** yang ingin mengirim pesan, broadcast, dan menerima event lewat REST API dan webhook.

Mulai dari panduan yang paling cocok dengan pekerjaan Anda. Semua panduan memakai contoh yang benar-benar ada di aplikasi, bukan fitur bayangan.

## Peta panduan

| Panduan | Untuk siapa | Isi |
| --- | --- | --- |
| [01 — Memulai untuk UMKM](01-memulai-umkm.md) | Pemilik usaha, admin, operator | Daftar akun, pilih paket, bayar, hubungkan WhatsApp, kirim pesan pertama |
| [02 — Broadcast](02-broadcast.md) | Operator marketing | Kirim pesan massal, format CSV, variabel, spintax, opt-in, suppression, batas paket |
| [03 — Auto-reply](03-auto-reply.md) | Operator CS | Semua jenis aturan, prioritas, jadwal, cooldown, rate limit, contoh siap pakai |
| [04 — Media dan batas upload](04-media-dan-limit-upload.md) | Operator, developer | Format file, batas per paket, penyimpanan, kompresi gambar, batas WhatsApp |
| [05 — API untuk developer](05-api-developer.md) | Developer | Autentikasi, scope, idempotency, semua endpoint, contoh cURL/Node.js/PHP, SDK mini |
| [06 — Webhook](06-webhook.md) | Developer | Event, bentuk payload, verifikasi signature, retry, replay, keamanan |
| [07 — Integrasi tanpa kode](07-integrasi-tanpa-kode.md) | Pemilik toko online | WordPress/Contact Form 7, WooCommerce, Google Forms |
| [08 — Troubleshooting dan FAQ](08-troubleshooting-faq.md) | Semua | Arti status, error umum, kuota, perangkat terputus, 413, 429 |
| [09 — Paket, harga, dan margin](09-paket-dan-margin.md) | Pemilik bisnis | Matriks paket, biaya VPS/domain, titik impas, rekomendasi margin |
| [10 — Panduan admin](10-panduan-admin.md) | Superadmin | Verifikasi pembayaran, assign paket, override, pemantauan |

## Alamat layanan

| Keperluan | Alamat |
| --- | --- |
| Aplikasi gateway (dashboard + API) | `https://wagateway.kingofcoding.my.id` |
| Website marketing dan halaman harga | `https://pesanpro.kingofcoding.my.id` |
| Basis URL API | `https://wagateway.kingofcoding.my.id/api/v1` |

Jangan menukar kedua domain. Website marketing hanya menjelaskan produk; aplikasi gateway adalah tempat akun, perangkat, dan API benar-benar berjalan.

## Istilah yang dipakai

| Istilah | Arti |
| --- | --- |
| **Perangkat / device / sesi** | Satu nomor WhatsApp yang terhubung ke PesanPro |
| **Pesan terkirim** | Satu pesan keluar yang berhasil masuk antrean dan diproses |
| **Broadcast** | Pengiriman satu pesan ke banyak penerima dengan jeda |
| **Auto-reply** | Balasan otomatis ketika pesan masuk cocok dengan aturan |
| **Webhook** | Permintaan HTTP yang PesanPro kirim ke sistem Anda saat ada event |
| **API key** | Kunci rahasia `wag_...` untuk memanggil API |
| **Integration token** | Kunci rahasia `ppint_...` khusus integrasi form/toko online |
| **Entitlement** | Hak paket: batas perangkat, pesan, broadcast, dan sebagainya |
| **Kuota** | Sisa hak paket pada periode berjalan |
| **Suppression** | Daftar nomor yang tidak boleh dikirimi broadcast |

## Aturan dasar yang berlaku di semua panduan

1. **Satu nomor WhatsApp = satu perangkat.** Jangan menghubungkan nomor yang sama ke dua perangkat PesanPro.
2. **Paket aktif diperlukan untuk mengirim.** Akun baru bisa masuk dashboard, tetapi pengiriman, auto-reply, webhook, dan upload media terkunci sampai pembayaran disetujui.
3. **Isi pesan tidak disimpan.** PesanPro menyimpan metadata pengiriman (status, waktu, penerima, kode error), bukan isi pesan.
4. **Hormati penerima.** Gunakan opt-in untuk broadcast dan sediakan cara berhenti. Pesan massal tanpa izin berisiko diblokir WhatsApp.
5. **Jangan bagikan secret.** API key dan integration token hanya ditampilkan sekali. Simpan di secret manager, bukan di kode atau repositori.

## Cara cepat memilih jalur

- Saya hanya ingin mengirim pesan dan broadcast dari dashboard → mulai dari [01 — Memulai untuk UMKM](01-memulai-umkm.md).
- Saya ingin aplikasi saya mengirim WhatsApp otomatis → mulai dari [05 — API untuk developer](05-api-developer.md).
- Saya ingin menerima notifikasi saat ada pesan masuk → mulai dari [06 — Webhook](06-webhook.md).
- Saya punya toko WordPress/WooCommerce atau form Google → mulai dari [07 — Integrasi tanpa kode](07-integrasi-tanpa-kode.md).
- Saya ingin tahu paket mana yang cocok dan marginnya → [09 — Paket, harga, dan margin](09-paket-dan-margin.md).
