# 08 — Troubleshooting dan FAQ

Halaman ini membantu Anda menemukan penyebab masalah umum. Mulai dari gejala, lalu ikuti bagian yang sesuai.

## Akun dan pembayaran

### Saya baru daftar, tapi tidak bisa mengirim pesan

Itu normal. PesanPro tidak punya paket trial. Akun baru berada di paket **Belum aktif**.

Perbaikan:

1. Buka **Billing**.
2. Pilih paket.
3. Kirim bukti pembayaran.
4. Tunggu admin menyetujui.
5. Setelah status menjadi **ACTIVE**, pengiriman aktif.

### Bukti pembayaran saya ditolak

Penyebab umum:

- Nominal tidak sesuai harga paket.
- Bukti tidak terbaca (buram, terpotong).
- Referensi pembayaran tidak cocok.
- File bukan JPG/PNG/WebP/PDF, atau lebih dari 5 MB.

Perbaikan: kirim ulang dengan bukti yang jelas dan nominal yang sesuai. Catatan penolakan terlihat di riwayat pembayaran.

### Saya sudah bayar, tapi status masih Belum aktif

Pembayaran diverifikasi **manual**. Kalau lebih dari 1×24 jam kerja, hubungi admin dengan menyertakan:

- Email akun.
- Tanggal dan nominal transfer.
- Referensi pembayaran.
- Tangkapan layar bukti.

### Apakah ada refund?

Kebijakan refund mengikuti ketentuan layanan. Hubungi admin sebelum melakukan pembayaran ulang.

---

## Perangkat WhatsApp

### QR tidak muncul

1. Pastikan paket aktif.
2. Pastikan jumlah perangkat belum mencapai batas paket.
3. Muat ulang halaman perangkat.
4. Klik **Start** atau **Restart**.
5. Kalau tetap kosong, hubungi admin.

QR berlaku sekitar **1 jam**. Kalau kedaluwarsa, minta QR baru.

### QR sudah dipindai, tetapi status tidak menjadi CONNECTED

1. Tunggu 30–60 detik.
2. Pastikan ponsel punya koneksi internet.
3. Pastikan WhatsApp di ponsel tidak sedang memakai fitur yang mengunci sesi.
4. Klik **Restart**.
5. Kalau tetap gagal, logout lalu pindai ulang.

### Perangkat tiba-tiba DISCONNECTED

Penyebab umum:

- Ponsel kehilangan internet.
- WhatsApp di ponsel diperbarui.
- Nomor dipakai di perangkat lain.
- Sesi WhatsApp berakhir.
- Server restart.

Perbaikan:

1. Buka halaman perangkat.
2. Klik **Start**.
3. Kalau status menjadi `LOGGED_OUT`, pindai QR ulang.
4. Kalau sering terjadi, periksa stabilitas internet ponsel dan hindari memakai nomor yang sama di dua gateway.

### Muncul LOGGED_OUT

Sesi WhatsApp benar-benar berakhir. Anda harus menghubungkan ulang:

1. Buka halaman perangkat.
2. Klik **Logout** (kalau masih tersedia) atau **Restart**.
3. Pindai QR baru dari ponsel.

### Batas perangkat

| Paket | Perangkat |
| --- | --- |
| Starter | 1 |
| Bisnis | 3 |
| Pro | 5 |

Kalau sudah penuh, hapus perangkat yang tidak dipakai atau naik paket.

---

## Pengiriman pesan

### Pesan berstatus PENDING lama

1. Periksa perangkat `CONNECTED`.
2. Periksa antrean di **Message Queue**.
3. Kalau perangkat terputus, sambungkan lagi; pesan akan diproses setelah perangkat siap.
4. Kalau lebih dari 15 menit, hubungi admin.

### Pesan FAILED

Lihat kode error pada detail pesan.

| Kode | Arti | Perbaikan |
| --- | --- | --- |
| `RECIPIENT_NOT_ON_WHATSAPP` | Nomor tidak terdaftar di WhatsApp | Periksa nomor |
| `INVALID_RECIPIENT` | Format nomor salah | Gunakan `08...`, `62...`, atau `+62...` |
| `SESSION_NOT_CONNECTED` | Perangkat tidak terhubung | Sambungkan perangkat |
| `SESSION_LOGGED_OUT` | Sesi berakhir | Pindai QR ulang |
| `QUOTA_EXCEEDED` | Kuota pesan habis | Tunggu periode baru atau naik paket |
| `ENTITLEMENT_DENIED` | Paket tidak aktif / fitur tidak tersedia | Selesaikan pembayaran |
| `MEDIA_TOO_LARGE` | Media melebihi batas | Kecilkan file |
| `RATE_LIMITED` | Terlalu cepat | Beri jeda, coba lagi |

### Pesan SENT tetapi tidak diterima

`SENT` berarti WhatsApp menerima perintah, bukan berarti pesan sampai. Periksa:

1. Status berikutnya (`DELIVERED` atau `READ`).
2. Nomor penerima benar.
3. Penerima tidak memblokir nomor Anda.
4. Penerima tidak memakai WhatsApp versi modifikasi.
5. Pesan tidak mengandung link yang diblokir.

### Pesan terkirim dua kali

Penyebab umum:

- Request API dikirim ulang tanpa `Idempotency-Key` yang sama.
- Integrasi membuat key baru setiap retry.
- Dua sistem mengirim pesan yang sama.

Perbaikan: gunakan key stabil, misalnya `order-1042-notify`, dan pakai key yang sama saat retry.

---

## Kuota dan paket

### Quota exceeded padahal baru kirim sedikit

Periksa:

1. **Billing → Entitlements & usage** untuk melihat angka terpakai.
2. Broadcast besar yang baru dijalankan.
3. Pesan terjadwal yang dieksekusi bersamaan.
4. Retry yang mengirim ulang pesan gagal.

Kuota dihitung per periode langganan, bukan per tanggal kalender. Periode dimulai dari tanggal aktivasi paket.

### Fitur terkunci padahal paket aktif

1. Pastikan status paket `ACTIVE`, bukan `GRACE_PERIOD` atau `EXPIRED`.
2. Periksa apakah fitur termasuk paket (lihat [09 — Paket, harga, dan margin](09-paket-dan-margin.md)).
3. Kalau baru upgrade, tunggu beberapa detik lalu muat ulang.
4. Kalau memakai API, pastikan scope API key mencakup fitur tersebut.

### Apa yang terjadi kalau paket kedaluwarsa?

- Status menjadi `GRACE_PERIOD` (masa tenggang) bila dikonfigurasi.
- Selama grace period, akses baca dan API observability tetap ada, tetapi pengiriman baru, broadcast, jadwal, auto-reply, webhook, dan upload dibekukan.
- Setelah grace period, status menjadi `EXPIRED` dan pengiriman berhenti.

Perpanjang dari **Billing** sebelum masa tenggang habis.

---

## Media

### Upload gagal 413

File melebihi batas paket atau batas server.

1. Periksa batas paket: Starter 50 MB, Bisnis 75 MB, Pro 100 MB. Yang juga berbeda adalah ruang penyimpanan (1/5/20 GB).
2. Kecilkan file.
3. Untuk video, kompres ke bawah 16 MB (batas WhatsApp).
4. Kalau memakai Nginx, pastikan `client_max_body_size` cukup besar (misalnya `105m`).

### Upload gagal 415

Format tidak didukung. Gunakan JPEG/PNG/WebP, MP4, MP3/OGG/M4A/WAV, PDF/DOCX/XLSX/PPTX/TXT.

### Upload berhasil, tetapi kirim media gagal

1. Periksa batas WhatsApp: gambar/video/audio 16 MB, dokumen 100 MB.
2. Periksa tipe media sesuai field URL.
3. Pastikan `mediaId` milik tenant Anda.
4. Coba kirim sebagai dokumen kalau gambar/video gagal.

### Media hilang setelah 30 hari

Retensi default media adalah 30 hari. Kalau masih dibutuhkan, unduh atau upload ulang. Media yang dipakai workflow aktif dilindungi sampai workflow selesai.

---

## Broadcast

### Broadcast berhenti di tengah

Penyebab umum:

- Perangkat terputus.
- Kuota pesan habis.
- Terlalu banyak penerima tidak valid.
- Broadcast dijeda manual.

Perbaikan:

1. Buka detail broadcast.
2. Periksa status dan error.
3. Sambungkan perangkat.
4. Klik **Resume** kalau status `PAUSED`.
5. Perbaiki daftar penerima kalau banyak yang gagal.

### Banyak penerima dilewati

| Alasan | Arti |
| --- | --- |
| `RECIPIENT_SUPPRESSED` | Nomor ada di suppression |
| `OPT_IN_REQUIRED` | Kontak belum opt-in |
| `INVALID_RECIPIENT` | Nomor tidak valid |
| `DUPLICATE_RECIPIENT` | Nomor ganda |

Perbaiki daftar sebelum mengirim ulang.

### CSV ditolak

- Ukuran > 2 MB.
- Lebih dari 20 kolom.
- Tidak ada kolom nomor yang dikenali.
- Encoding bukan UTF-8.
- Template memakai variabel yang tidak ada di CSV.

Perbaiki file dan import ulang.

### Broadcast lambat

Broadcast memakai jeda yang Anda tentukan. Untuk 1.000 penerima dengan jeda 10–20 detik, waktu kirim sekitar 2,5–5,5 jam. Ini normal dan disengaja untuk mengurangi risiko diblokir.

---

## Auto-reply

### Auto-reply tidak membalas

Periksa berurutan:

1. Perangkat `CONNECTED`.
2. Aturan `isEnabled = true`.
3. Kata kunci cocok. Ingat: `EXACT` harus sama persis (tanpa membedakan huruf besar/kecil).
4. `triggerType` sesuai: `PRIVATE` hanya untuk chat pribadi, `GROUP` hanya grup.
5. Jadwal aktif (hari dan jam).
6. Cooldown belum aktif.
7. Rate limit kontak belum tercapai.
8. Chain depth belum tercapai.
9. Kuota pesan masih ada.
10. Log auto-reply menunjukkan alasan.

### Auto-reply membalas terlalu sering

Naikkan `cooldownSeconds`, turunkan `rateLimitCount`, atau turunkan `maxChainDepth`.

### Regex ditolak

PesanPro membatasi regex untuk keamanan. Yang tidak boleh:

- Lookaround `(?=...)`
- Named group `(?<...>...)`
- Backreference `\1`
- Group `(...)`
- Alternasi `|`
- `*` dan `+`
- Rentang `{2,}` atau `{2,5}`

Gunakan pola sederhana seperti `^INV-[0-9]{4}$`.

### Aturan bentrok

Dua aturan dengan kata kunci, jenis, dan prioritas sama. Ubah prioritas salah satunya. Aturan dengan prioritas lebih besar menang; kalau sama, aturan yang lebih lama menang.

---

## Webhook

### Webhook tidak masuk

1. Periksa URL bisa diakses publik.
2. Pastikan HTTPS valid.
3. Periksa event yang dipilih.
4. Periksa delivery history di dashboard.
5. Pastikan server membalas `2xx`.
6. Pastikan tidak memblokir IP/User-Agent PesanPro.

### Signature tidak valid

1. Gunakan **raw body**, bukan JSON hasil parse ulang.
2. Rumus: `HMAC_SHA256(secret, timestamp + "." + eventId + "." + rawBody)`.
3. Timestamp 10 digit detik.
4. Bandingkan tanpa prefix `v1=`.
5. Pastikan secret yang dipakai adalah secret endpoint yang benar.

### Webhook diterima dua kali

Itu bisa terjadi saat retry. Simpan `x-pesanpro-event-id` dan abaikan duplikat selama minimal 10 menit.

### Webhook timeout

Server Anda terlalu lama membalas. Balas `2xx` dulu, proses event secara asinkron.

---

## API

### 401 Unauthorized

- Header `x-api-key` tidak ada.
- Key salah atau sudah dicabut.
- Key kedaluwarsa.
- IP Anda tidak ada di allowlist.

### 403 ENTITLEMENT_DENIED

- Paket belum aktif.
- Fitur tidak termasuk paket.
- Paket dalam grace period dan fitur dibekukan.
- Scope API key tidak mencukupi.

### 422 VALIDATION_ERROR

Baca `error.details`. Contoh penyebab:

- `recipient` kosong atau format salah.
- `text` lebih dari 4.096 karakter.
- `delayMaxMs` lebih kecil dari `delayMinMs`.
- `type` media tidak sesuai field URL.
- `cronExpression` tidak diisi untuk jadwal berulang.

### 429

- Kuota pesan habis (`QUOTA_EXCEEDED`).
- Rate limit per menit (`RATE_LIMITED`).
- Rate limit IP.

Gunakan exponential backoff. Jangan retry agresif.

### 500 INTERNAL_ERROR

Kesalahan server. Retry dengan backoff. Kalau berulang, hubungi admin dengan `requestId`.

---

## Keamanan dan privasi

### Apakah PesanPro menyimpan isi pesan?

Tidak. PesanPro menyimpan metadata pengiriman (status, waktu, penerima, kode error), bukan isi pesan. Webhook `message.received` meneruskan isi pesan secara live ke sistem Anda; sistem Andalah yang menentukan retensinya.

### Apakah nomor saya bisa diblokir WhatsApp?

Bisa, terutama kalau:

- Mengirim massal tanpa izin.
- Mengirim terlalu cepat.
- Pesan identik berulang.
- Banyak penerima melaporkan/block.

PesanPro menyediakan jeda, spintax, opt-in, dan suppression untuk mengurangi risiko, tetapi tidak bisa menjamin nomor tidak diblokir. Gunakan WhatsApp Business dan patuhi kebijakan WhatsApp.

### Siapa yang bisa melihat media saya?

Hanya tenant Anda. Media disimpan privat dan tidak bisa diakses tenant lain. Admin platform dapat mengakses untuk keperluan operasional dan dukungan.

### Bagaimana cara menghapus data?

- Hapus media dari dashboard/API.
- Hapus aturan auto-reply yang tidak dipakai.
- Hubungi admin untuk penghapusan akun dan data terkait.

---

## Kapan harus menghubungi admin

Hubungi admin kalau:

1. Pembayaran tidak aktif setelah 1×24 jam kerja.
2. Perangkat tidak bisa terhubung setelah 3 kali percobaan.
3. Error `500` berulang dengan `requestId` yang sama.
4. Kuota terlihat tidak sesuai padahal penggunaan wajar.
5. Webhook gagal terus padahal server Anda membalas `2xx`.
6. Anda mencurigai kebocoran API key.

Sertakan:

- Email akun.
- Waktu kejadian (zona waktu).
- `requestId` atau ID pesan.
- Tangkapan layar.
- Langkah yang sudah dicoba.

## Cara menghubungi admin

Buka menu **Bantuan** di dashboard. Halaman itu menampilkan tombol **Chat lewat WhatsApp** ke nomor yang diatur superadmin.

Kalau tombolnya tidak muncul, admin belum mengisi nomor bantuan. Sampaikan kendala lewat email yang dipakai saat mendaftar, atau minta admin mengisi **Settings → Support contact**.
