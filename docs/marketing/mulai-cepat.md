# Panduan Mulai Cepat (/docs/mulai-cepat)

## FAKTA

- Alur akun: daftar, pilih paket, transfer, unggah bukti, lalu menunggu persetujuan admin.
- Akun PENDING belum bisa mengirim pesan, auto-reply, webhook, atau upload media.
- Setelah disetujui: login, hubungkan WhatsApp lewat QR, buat kunci API, kirim pesan.
- Endpoint kirim teks: `POST https://wagateway.kingofcoding.my.id/api/v1/messages/text`.
- Header wajib: `x-api-key`, `idempotency-key` (8 sampai 128 karakter URL-safe), `Content-Type: application/json`.
- Body wajib: `sessionId`, `recipient`, `text`.
- Nomor penerima memakai format internasional tanpa tanda plus, contoh `6281234567890`.
- Respons sukses membuat pekerjaan baru adalah `202 Accepted`.
- Status pesan dicek lewat `GET /api/v1/messages/<id>` dengan `x-api-key` yang sama.
- Webhook pesan masuk memakai event `message.received` dengan field `from`, `content`, `type`, `isGroup`.
- Route `/docs/mulai-cepat` belum ada di aplikasi. Saat ini panduan ada di `/docs/01-memulai-umkm`.

## DRAF

> **Status: DRAF.** Panduan ini bisa dipakai setelah v0.2.0 live. Route `/docs/mulai-cepat` perlu dibuat atau dialias ke panduan ini.

# Mulai Cepat: QR ke Pesan Pertama lewat API

Panduan ini mengantar Anda dari akun yang sudah aktif sampai pesan pertama terkirim lewat API. Targetnya sekitar 5 menit setelah pembayaran disetujui.

> **Sebelum mulai:** akun baru berstatus PENDING. Anda baru bisa mengirim pesan setelah admin menyetujui bukti transfer. Dashboard dan halaman Tagihan tetap bisa dibuka selama menunggu.

## Yang perlu disiapkan

- Akun PesanPro yang sudah disetujui.
- Ponsel dengan WhatsApp aktif.
- Kunci API dari dashboard.
- Terminal atau aplikasi untuk menjalankan cURL.

## Langkah 1: Masuk ke dashboard

Buka `https://wagateway.kingofcoding.my.id/auth/login`, lalu masuk dengan email dan kata sandi yang Anda daftarkan.

Kalau akun masih PENDING, selesaikan pembayaran di menu **Tagihan**. Setelah admin menyetujui, status paket berubah menjadi aktif.

## Langkah 2: Hubungkan WhatsApp lewat QR

1. Buka menu **Perangkat & QR**.
2. Klik **Tambah perangkat**.
3. Pindai QR yang muncul dengan WhatsApp di ponsel: **Pengaturan → Perangkat tertaut → Tautkan perangkat**.
4. Tunggu sampai status perangkat menjadi **CONNECTED**.

Satu nomor WhatsApp hanya boleh terhubung ke satu perangkat PesanPro. Jangan memindai nomor yang sama di dua tempat.

## Langkah 3: Buat kunci API

1. Buka menu **Kunci API**.
2. Klik **Buat kunci**.
3. Pilih scope yang dibutuhkan. Untuk mengirim pesan, kunci harus punya akses kirim pesan.
4. Salin kunci yang muncul. Kunci hanya ditampilkan sekali.

Simpan kunci di environment variable server, bukan di kode yang berjalan di browser.

## Langkah 4: Kirim pesan pertama dengan cURL

Ganti `wag_...` dengan kunci API Anda, `sesi_anda` dengan ID perangkat dari dashboard, dan nomor penerima dengan nomor tujuan.

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/messages/text" \
  -H "x-api-key: wag_..." \
  -H "idempotency-key: mulai-cepat-001" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sesi_anda",
    "recipient": "6281234567890",
    "text": "Halo dari PesanPro"
  }'
```

Penjelasan header dan body:

| Bagian | Arti |
| --- | --- |
| `x-api-key` | Kunci rahasia akun Anda. Jangan dibagikan. |
| `idempotency-key` | Kunci unik per pesan, 8 sampai 128 karakter. Kalau permintaan diulang dengan kunci yang sama, pesan tidak terkirim dua kali. |
| `sessionId` | ID perangkat WhatsApp yang sudah terhubung. |
| `recipient` | Nomor tujuan format internasional tanpa `+`. |
| `text` | Isi pesan, maksimal 4.096 karakter. |

Respons sukses adalah `202 Accepted` karena pesan masuk antrean dulu. Catat `id` pekerjaan dari respons.

## Langkah 5: Periksa status pengiriman

```bash
curl "https://wagateway.kingofcoding.my.id/api/v1/messages/<id>" \
  -H "x-api-key: wag_..."
```

Status akhir menunjukkan apakah pesan terkirim, masih diproses, atau gagal. Kalau gagal, kode kesalahan menunjukkan penyebabnya.

## Kalau gagal

| Gejala | Kemungkinan penyebab | Yang dicek |
| --- | --- | --- |
| `401 UNAUTHORIZED` | Kunci API salah atau tidak dikirim | Header `x-api-key`, kunci sudah dirotasi atau belum |
| `403 ENTITLEMENT_DENIED` | Paket belum aktif atau kuota habis | Status langganan di menu Tagihan, sisa kuota |
| `422 VALIDATION_ERROR` | Body tidak lengkap atau format nomor salah | `sessionId`, `recipient`, `text`, panjang `idempotency-key` |
| `429` | Terlalu banyak permintaan | Kurangi laju permintaan, cek batas paket |
| `202` tetapi pesan tidak sampai | Perangkat terputus atau nomor tujuan tidak valid | Status perangkat, format nomor, centang kode kesalahan |

Kalau perangkat terputus, buka **Perangkat & QR** dan sambungkan ulang. Kalau kunci API hilang, buat kunci baru lalu hapus kunci lama.

## Menerima pesan masuk lewat webhook

Setelah pengiriman berjalan, Anda bisa menerima pesan masuk. Daftarkan alamat webhook di menu **Webhook**. Pesan masuk dikirim dengan event `message.received` dan field:

- `from`: nomor pengirim.
- `content`: isi pesan.
- `type`: jenis pesan.
- `isGroup`: apakah pesan berasal dari grup.

Pastikan server Anda membalas `2xx` dengan cepat. Kalau gagal, PesanPro mencoba ulang sesuai kebijakan retry.

## Langkah berikutnya

- Pelajari semua endpoint di [API untuk developer](/docs/05-api-developer).
- Atur balasan otomatis di [Auto-reply](/docs/03-auto-reply).
- Lihat batas paket di [Harga](/harga).

## TODO

- Buat route `/docs/mulai-cepat` atau alihkan ke panduan ini. Saat ini panduan setara ada di `/docs/01-memulai-umkm`.
- Konfirmasi teks tombol dan nama menu setelah v0.2.0 live. Nama menu mengikuti dashboard: **Perangkat & QR**, **Kunci API**, **Webhook**, **Tagihan**.
- Konfirmasi kode error final dari API sebelum menampilkan tabel yang lebih rinci.
- Tambahkan tangkapan layar setelah UI final.
- Pastikan contoh `sessionId` tidak membingungkan. Dashboard memakai ID publik perangkat, bukan nama perangkat.
