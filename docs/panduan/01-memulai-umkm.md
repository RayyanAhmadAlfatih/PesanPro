# 01 — Memulai untuk UMKM

Panduan ini untuk pemilik usaha yang ingin memakai PesanPro lewat dashboard, tanpa menulis kode. Ikuti urutannya; setiap langkah harus selesai sebelum lanjut.

> **Penting:** PesanPro tidak lagi punya paket trial gratis. Akun baru bisa masuk dashboard, tetapi **pengiriman, auto-reply, webhook, dan upload media terkunci** sampai paket dibayar dan pembayaran disetujui.

## Yang perlu disiapkan

1. Email aktif yang bisa Anda buka.
2. Nomor WhatsApp yang akan dipakai untuk usaha. Disarankan nomor khusus usaha, bukan nomor pribadi.
3. Ponsel dengan WhatsApp aktif untuk memindai QR.
4. Bukti transfer pembayaran (JPG, PNG, WebP, atau PDF, maksimal 5 MB).

## Langkah 1 — Daftar akun

1. Buka `https://wagateway.kingofcoding.my.id/auth/register`.
2. Isi nama lengkap, email, dan kata sandi.
3. Kata sandi minimal 10 karakter dan harus mengandung huruf besar, huruf kecil, dan angka.
4. Klik **Create account**.
5. Anda akan diarahkan ke halaman masuk. Masuk dengan email dan kata sandi tadi.

Setelah masuk, dashboard menampilkan paket **Belum aktif**. Ini normal: akun sudah jadi, tetapi belum ada paket berbayar.

## Langkah 2 — Pilih paket dan bayar

1. Buka menu **Billing**.
2. Pada bagian **Available plans**, pilih paket:
   - **Starter** — 1 perangkat, 3.000 pesan/bulan.
   - **Bisnis** — 3 perangkat, 12.000 pesan/bulan.
   - **Pro** — 5 perangkat, 40.000 pesan/bulan.
3. Pilih periode **Bulanan** atau **Tahunan**. Harga tahunan = 10× harga bulanan, jadi Anda membayar 10 bulan untuk 12 bulan pemakaian.
4. Nominal muncul otomatis dan **tidak bisa diubah**. Ini disengaja supaya jumlah yang Anda transfer selalu sama dengan harga paket.
5. Isi **Payment reference**, misalnya nama Anda atau nomor invoice.
6. Unggah **bukti pembayaran**.
7. Klik **Kirim untuk diverifikasi**.

Admin akan memeriksa bukti tersebut. Setelah disetujui:

- Status paket berubah dari **Belum aktif** menjadi **ACTIVE**.
- Hak paket langsung berlaku.
- Anda menerima email konfirmasi pembayaran.

> **Belum tahu paket mana?** Mulai dari Starter kalau hanya satu nomor dan volume pesan di bawah 3.000/bulan. Naik ke Bisnis kalau butuh 2–3 nomor atau broadcast lebih sering. Lihat perbandingan lengkap di [09 — Paket, harga, dan margin](09-paket-dan-margin.md).

## Langkah 3 — Hubungkan WhatsApp

1. Buka menu **Sessions** (Perangkat).
2. Klik **Tambah perangkat**.
3. Beri nama yang mudah dikenali, misalnya `CS Utama` atau `Toko Bandung`.
4. Pilih metode koneksi:
   - **QR** — pindai dengan WhatsApp di ponsel.
   - **Pairing code** — masukkan kode 8 digit di WhatsApp.
5. Untuk QR:
   1. Di ponsel, buka **WhatsApp → Pengaturan → Perangkat tertaut → Tautkan perangkat**.
   2. Arahkan kamera ke QR di layar.
   3. Tunggu sampai status berubah menjadi **CONNECTED**.
6. Untuk pairing code:
   1. Buka **Perangkat tertaut → Tautkan dengan nomor telepon**.
   2. Masukkan kode yang tampil di dashboard.

Status perangkat yang perlu Anda kenal:

| Status | Arti | Tindakan |
| --- | --- | --- |
| `QR_REQUIRED` | Menunggu pindai QR | Buka halaman perangkat, pindai QR |
| `PAIRING_REQUIRED` | Menunggu kode pairing | Masukkan kode di ponsel |
| `CONNECTING` | Sedang menyambung | Tunggu 10–60 detik |
| `CONNECTED` | Siap dipakai | Tidak ada |
| `RECONNECTING` | Sambungan terputus, mencoba lagi | Tunggu; kalau lama, restart perangkat |
| `DISCONNECTED` | Terputus | Klik **Start** atau **Restart** |
| `LOGGED_OUT` | Sesi WhatsApp berakhir | Pindai QR ulang |
| `STOPPED` | Dihentikan manual | Klik **Start** kalau ingin dipakai |
| `FAILED` | Gagal permanen | Lihat pesan error, lalu hubungkan ulang |

> **Satu nomor, satu perangkat.** Jangan menghubungkan nomor yang sama ke dua perangkat PesanPro. WhatsApp akan memutus salah satunya dan pesan bisa hilang.

## Langkah 4 — Kirim pesan pertama

Dashboard tidak memakai halaman chat. Untuk mengirim pesan, gunakan salah satu dari tiga jalur berikut.

### A. Broadcast ke satu penerima (paling cepat)

1. Buka menu **Broadcast**.
2. Isi nama kampanye, misalnya `Tes kirim`.
3. Masukkan nomor tujuan di kolom penerima. Format yang diterima:
   - `628123456789`
   - `+62 812-3456-789`
   - `0812-3456-789` (akan dinormalisasi)
4. Tulis pesan. Contoh:
   ```
   Halo Kak, ini tes dari PesanPro. Terima kasih sudah mencoba layanan kami.
   ```
5. Atur jeda minimum dan maksimum. Untuk satu penerima, jeda tidak berpengaruh.
6. Klik **Kirim broadcast**.
7. Buka **Message Queue** untuk melihat status: `PENDING` → `SENT` → `DELIVERED` → `READ`.

### B. Pesan terjadwal

1. Buka menu **Scheduler**.
2. Isi penerima, teks, dan waktu kirim.
3. Pilih zona waktu, biasanya `Asia/Jakarta`.
4. Pilih **One time**.
5. Klik **Schedule message**.

Cocok untuk pengingat, ucapan, atau pengumuman yang harus keluar pada jam tertentu.

### C. Lewat API

Kalau Anda punya aplikasi atau ingin mengirim dari sistem lain, gunakan API. Contoh lengkap ada di [05 — API untuk developer](05-api-developer.md).

## Langkah 5 — Atur auto-reply

Auto-reply membuat WhatsApp membalas otomatis saat pelanggan mengirim kata tertentu.

Contoh paling sering dipakai:

| Pelanggan menulis | Balasan |
| --- | --- |
| `halo` | Sapaan dan jam operasional |
| `harga` | Daftar harga |
| `alamat` | Alamat toko dan link maps |
| `jam buka` | Jam operasional |
| (tidak cocok aturan apa pun) | Pesan fallback: "Ketik harga, alamat, atau jam buka." |

Langkah singkat:

1. Buka **Auto-reply**.
2. Pilih perangkat.
3. Klik **Tambah aturan**.
4. Isi kata kunci, jenis pencocokan, dan balasan.
5. Simpan, lalu uji dengan **Preview** sebelum dipakai.
6. Kirim pesan dari ponsel lain untuk memastikan balasan keluar.

Detail semua jenis aturan, prioritas, jadwal, dan contoh siap pakai ada di [03 — Auto-reply](03-auto-reply.md).

## Langkah 6 — Pantau pengiriman

Menu **Message Queue** menampilkan semua pesan keluar: dari API, broadcast, dan scheduler.

| Status | Arti | Tindakan |
| --- | --- | --- |
| `PENDING` | Menunggu diproses | Tunggu |
| `PROCESSING` | Sedang dikirim | Tunggu |
| `RETRYING` | Gagal sementara, akan dicoba lagi | Tunggu |
| `SENT` | Sudah dikirim ke WhatsApp | Tidak ada |
| `DELIVERED` | Sampai ke ponsel penerima | Tidak ada |
| `READ` | Dibaca penerima | Tidak ada |
| `FAILED` | Gagal permanen | Lihat kode error, perbaiki nomor/perangkat, lalu **Retry** |

Kalau banyak pesan `FAILED` dengan kode yang sama, periksa:

1. Status perangkat masih `CONNECTED`.
2. Nomor penerima valid dan aktif di WhatsApp.
3. Kuota pesan paket belum habis.
4. Nomor penerima tidak masuk daftar suppression.

## Kebiasaan yang membuat akun tetap sehat

1. **Hangatkan nomor baru.** Jangan langsung broadcast ke ratusan nomor dengan nomor yang baru dibuat. Kirim ke kontak sendiri dulu selama beberapa hari.
2. **Pakai jeda wajar.** Jangan kirim 500 pesan dalam 1 menit. Gunakan jeda 10–20 detik seperti pengaturan awal.
3. **Minta izin.** Broadcast hanya ke pelanggan yang setuju menerima pesan.
4. **Sediakan cara berhenti.** Contoh: "Balas STOP untuk berhenti menerima promosi." Masukkan nomor yang berhenti ke **Suppression**.
5. **Jangan kirim pesan identik bertubi-tubi.** Gunakan spintax `{Halo|Hai}` agar variasi pesan lebih alami.
6. **Pisahkan nomor CS dan nomor promosi.** Kalau satu nomor diblokir, layanan pelanggan tetap jalan.

## Ringkasan alur

```
Daftar → Masuk → Pilih paket → Transfer → Unggah bukti
   → Admin setujui → Hubungkan WhatsApp (QR)
   → Kirim lewat Broadcast / Scheduler / API
   → Pantau di Message Queue
   → Atur Auto-reply untuk pesan masuk
```

Kalau ada langkah yang macet, lihat [08 — Troubleshooting dan FAQ](08-troubleshooting-faq.md).
