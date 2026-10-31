# 04 — Media dan batas upload

PesanPro bisa mengirim gambar, video, audio, dan dokumen sebagai lampiran pesan atau balasan auto-reply. Setiap paket punya batas ukuran file dan ruang penyimpanan sendiri.

## Ringkasan batas per paket

| Paket | Ukuran maksimal per file | Penyimpanan media | Retensi |
| --- | --- | --- | --- |
| Starter | **50 MB** | **1 GB** | 30 hari |
| Bisnis | **75 MB** | **5 GB** | 30 hari |
| Pro | **100 MB** | **20 GB** | 30 hari |

Batas per file naik mengikuti paket: 50 MB di Starter, 75 MB di Bisnis, dan 100 MB di Pro. Angka 100 MB adalah plafon karena itu batas dokumen yang masih bisa dikirim WhatsApp; file di atas 100 MB tetap akan ditolak WhatsApp. Yang juga membedakan paket adalah ruang penyimpanan, jumlah pesan, jumlah perangkat, dan kuota fitur lain.

Angka di atas adalah batas yang ditegakkan server. Kalau file lebih besar, upload ditolak dengan kode `MEDIA_TOO_LARGE` dan pesan yang menyebut batas paket Anda.

> **Batas platform.** Operator juga bisa menurunkan batas global lewat `MAX_UPLOAD_SIZE_MB`. Nilai efektif adalah yang **paling kecil** antara batas paket dan batas platform. Default platform 100 MB.

## Format yang didukung

| Jenis | Format | Ekstensi |
| --- | --- | --- |
| Gambar | JPEG, PNG, WebP | `.jpg`, `.jpeg`, `.png`, `.webp` |
| Video | MP4 | `.mp4` |
| Audio | MP3, OGG, M4A, WAV | `.mp3`, `.ogg`, `.m4a`, `.wav` |
| Dokumen | PDF, DOCX, XLSX, PPTX, TXT | `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt` |

File divalidasi dari **isi file**, bukan hanya nama atau MIME yang dikirim browser. File yang isinya tidak cocok dengan tipe yang diklaim ditolak dengan `MEDIA_SIGNATURE_MISMATCH`.

## Kompresi gambar

Gambar JPEG, PNG, dan WebP otomatis dikonversi ke WebP dengan kualitas 82 sebelum disimpan. Tujuannya:

1. Menghemat penyimpanan.
2. Mempercepat upload dan pengiriman.
3. Mengurangi risiko gagal kirim karena file terlalu besar.

Konversi ini tidak mengubah rasio atau memotong gambar. Kalau konversi gagal, file asli tetap disimpan selama masih di bawah batas.

> Kompresi hanya berlaku untuk gambar. Video dan dokumen dikirim apa adanya.

## Batas WhatsApp yang perlu Anda tahu

PesanPro menerima file sampai 50 MB (Starter), 75 MB (Bisnis), atau 100 MB (Pro). Di atas itu, **WhatsApp punya batas sendiri**:

| Jenis media | Batas WhatsApp |
| --- | --- |
| Gambar | 16 MB |
| Video | 16 MB |
| Audio | 16 MB |
| Dokumen | 100 MB |

Artinya:

- Video 40 MB akan **diterima** oleh PesanPro, tetapi kemungkinan **gagal dikirim** oleh WhatsApp karena melebihi 16 MB.
- Dokumen 80 MB masih bisa dikirim, selama WhatsApp menerima ukuran tersebut.
- Untuk video besar, kompres dulu ke bawah 16 MB sebelum upload.

Kalau Anda butuh video lebih besar, kompres dengan aplikasi video editor atau `ffmpeg`:

```bash
ffmpeg -i input.mp4 -vf "scale=-2:720" -c:v libx264 -crf 28 -preset medium -c:a aac -b:a 96k output.mp4
```

Perintah di atas menurunkan resolusi ke 720p dan mengompres audio. Ukuran biasanya turun 50–80%.

## Upload lewat dashboard

1. Buka halaman yang memakai lampiran: **Broadcast**, **Scheduler**, atau **Auto-reply**.
2. Klik **Pilih file**.
3. Pilih file. Dashboard menampilkan batas paket Anda di bawah tombol.
4. Tunggu sampai nama file muncul.
5. Kalau file terlalu besar, pesan error muncul sebelum upload dikirim ke server.

Kalau paket belum aktif, tombol upload dinonaktifkan dan dashboard menampilkan arahan ke halaman Billing.

## Upload lewat API

### 1. Upload file

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/media" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -F "file=@katalog.pdf" \
  -F "sessionId=cs-utama"
```

`sessionId` opsional. Kalau diisi, media dikaitkan ke perangkat tersebut. Respons berisi `id` media yang dipakai untuk mengirim pesan.

Contoh respons:

```json
{
  "requestId": "2f1c...",
  "data": {
    "id": "med_01J...",
    "originalName": "katalog.pdf",
    "mimeType": "application/pdf",
    "mediaType": "DOCUMENT",
    "sizeBytes": "842133",
    "status": "ACTIVE",
    "expiresAt": "2026-11-30T08:00:00.000Z"
  }
}
```

### 2. Kirim media

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/messages/media" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: kirim-katalog-001" \
  -d '{
    "sessionId": "cs-utama",
    "recipient": "628123456789",
    "type": "DOCUMENT",
    "mediaId": "med_01J...",
    "caption": "Katalog terbaru kami",
    "fileName": "katalog.pdf",
    "mimeType": "application/pdf"
  }'
```

### 3. Kirim dari URL publik

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/messages/media" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: kirim-gambar-001" \
  -d '{
    "sessionId": "cs-utama",
    "recipient": "628123456789",
    "type": "IMAGE",
    "imageUrl": "https://cdn.example.com/produk.jpg",
    "caption": "Produk baru"
  }'
```

Aturan URL:

- Harus publik, HTTP/HTTPS.
- Tidak boleh mengarah ke alamat internal/private (SSRF protection).
- Maksimal 2.048 karakter.
- Untuk `type` `IMAGE`, isi `imageUrl`; `VIDEO` → `videoUrl`; `AUDIO` → `audioUrl`; `DOCUMENT` → `documentUrl`.
- Isi **salah satu**: `mediaId` atau URL yang sesuai. Jangan keduanya.

> Untuk file yang ukurannya harus dijamin, gunakan `mediaId` (upload dulu). URL publik diunduh oleh klien WhatsApp, sehingga batas ukuran mengikuti WhatsApp, bukan paket Anda.

### 4. Impor media dari URL ke library

Kalau ingin file dari URL disimpan ke media library (sehingga terkena batas paket dan retensi):

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/media/import" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://cdn.example.com/katalog.pdf",
    "sessionId": "cs-utama",
    "fileName": "katalog.pdf"
  }'
```

### 5. Lihat dan hapus media

```bash
# Daftar media
curl "https://wagateway.kingofcoding.my.id/api/v1/media?limit=50" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"

# Metadata satu media
curl "https://wagateway.kingofcoding.my.id/api/v1/media/MEDIA_ID?metadata=1" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"

# Hapus media
curl -X DELETE "https://wagateway.kingofcoding.my.id/api/v1/media/MEDIA_ID" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"
```

Media yang masih dipakai workflow aktif (broadcast berjalan, jadwal aktif, aturan auto-reply aktif) tidak bisa dihapus. Anda akan menerima `MEDIA_IN_USE`.

## Penyimpanan dan retensi

- Media disimpan privat, bukan di folder publik.
- Setiap file milik tenant tertentu; tenant lain tidak bisa mengaksesnya.
- Retensi default **30 hari** sejak upload.
- Media yang masih direferensikan workflow aktif dilindungi sampai workflow selesai.
- Menghapus media mengembalikan kuota penyimpanan.

Kalau kuota penyimpanan habis, upload baru ditolak. Solusi:

1. Hapus media lama yang tidak dipakai.
2. Tunggu retensi 30 hari berjalan.
3. Naik paket.

## Ukuran praktis untuk UMKM

| Kebutuhan | Saran |
| --- | --- |
| Foto produk | JPEG/PNG, sisi terpanjang 1.080–1.600 px, biasanya < 1 MB |
| Katalog PDF | Kompres PDF, target < 5 MB |
| Video promo | 720p, 15–30 detik, target < 10 MB |
| Bukti transfer | JPG/PNG, < 2 MB |
| Dokumen invoice | PDF, < 1 MB |

## Error umum

| Kode | Arti | Perbaikan |
| --- | --- | --- |
| `MEDIA_TOO_LARGE` | Melebihi batas paket | Kecilkan file atau naik paket |
| `UNSUPPORTED_MEDIA_TYPE` | Format tidak didukung | Konversi ke format yang didukung |
| `MEDIA_SIGNATURE_MISMATCH` | Isi file tidak cocok dengan tipe | Simpan ulang dengan format yang benar |
| `EMPTY_MEDIA` | File kosong | Pilih file lain |
| `MEDIA_UPLOAD_BUSY` | Terlalu banyak upload bersamaan | Coba lagi beberapa detik |
| `MEDIA_IN_USE` | Media dipakai workflow aktif | Hentikan workflow dulu |
| `MEDIA_NOT_FOUND` | Media tidak ada atau milik tenant lain | Periksa ID dan kepemilikan |
| `QUOTA_EXCEEDED` | Penyimpanan penuh | Hapus media lama atau naik paket |
