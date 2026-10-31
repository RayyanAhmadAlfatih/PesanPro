# 02 — Broadcast

Broadcast adalah pengiriman satu pesan ke banyak penerima dengan jeda yang bisa diatur. Gunakan untuk promo, pengumuman, pengingat, atau informasi rutin.

Panduan ini mencakup dua jalur: **dashboard** untuk operator dan **API** untuk developer. Untuk API, contoh lengkap ada juga di [05 — API untuk developer](05-api-developer.md).

## Sebelum mulai

Pastikan:

1. Paket aktif dan kuota pesan masih ada.
2. Perangkat WhatsApp berstatus `CONNECTED`.
3. Anda punya izin dari penerima. Broadcast tanpa izin adalah penyebab utama nomor diblokir.
4. Anda tahu batas paket:

| Paket | Broadcast/bulan | Penerima per broadcast | Pesan/bulan | Jeda minimum |
| --- | --- | --- | --- | --- |
| Starter | 50 | 500 | 3.000 | 5 detik |
| Bisnis | 200 | 1.500 | 12.000 | 3 detik |
| Pro | 500 | 3.000 | 40.000 | 2 detik |

Batas penerima per broadcast dan batas pesan per bulan sama-sama berlaku. Broadcast ke 500 penerima memakai 500 dari kuota pesan bulanan Anda.

## Broadcast lewat dashboard

### Langkah 1 — Buka menu Broadcast

Di dashboard, pilih **Broadcast**. Halaman ini punya tiga bagian:

1. Form pembuatan broadcast.
2. Daftar broadcast yang sedang berjalan dan riwayatnya.
3. Daftar suppression (nomor yang tidak boleh dikirimi).

### Langkah 2 — Isi data broadcast

| Field | Wajib | Keterangan |
| --- | --- | --- |
| Nama kampanye | Tidak | Membantu Anda mencari broadcast di riwayat |
| Penerima | Ya | Nomor manual atau import CSV |
| Pesan | Ya | Maksimal 4.096 karakter |
| Media | Tidak | Gambar, video, audio, atau dokumen dari media library |
| Jeda minimum | Ya | Minimal 2 detik; paket Anda bisa menetapkan minimum lebih tinggi |
| Jeda maksimum | Ya | Harus ≥ jeda minimum |
| Wajib opt-in | Tidak | Kalau aktif, hanya kontak berstatus `OPTED_IN` yang dikirimi |

### Langkah 3 — Masukkan penerima

**Cara A — manual.** Ketik atau tempel nomor, satu nomor per baris. Format yang diterima:

```
628123456789
+62 812 3456 789
0812-3456-789
```

Duplikat otomatis dihapus. Nomor grup dilewati.

**Cara B — import CSV.** Klik **Import CSV** dan pilih file. Aturan file:

- Ukuran maksimal **2 MB**.
- Maksimal **20 kolom**.
- Baris pertama adalah header.
- Harus ada kolom nomor. Nama kolom yang dikenali: `phone`, `phone_number`, `mobile`, `number`, `recipient`, `jid`, `nomor`, `nomor_hp`, `no_hp`, `telepon`, `telephone`, `whatsapp`, `no_whatsapp`, `wa`.
- Kolom lain menjadi variabel untuk personalisasi.

Contoh CSV:

```csv
phone,name,company,invoice_no
628123456789,Ayu Setiawan,Nusantara Store,INV-2026-001
628987654321,Budi Kurnia,Studio Laju,INV-2026-002
```

Template siap pakai tersedia di dashboard: tombol **Unduh contoh CSV**.

### Langkah 4 — Tulis pesan

Anda bisa memakai tiga hal sekaligus:

1. **Teks biasa.**
2. **Variabel** dari CSV, ditulis `{{name}}`, `{{company}}`, `{{invoice_no}}`.
3. **Spintax** untuk variasi, ditulis `{Halo|Hai|Selamat pagi}`.

Contoh:

```
{Halo|Hai} {{name}}, terima kasih sudah berbelanja di {{company}}.
Invoice {{invoice_no}} sudah kami terima. Paket dikirim hari ini.
```

Pesan di atas akan menghasilkan variasi berbeda untuk setiap penerima. Ini membuat pesan tidak identik dan lebih aman untuk nomor pengirim.

Aturan variabel:

- Nama variabel: huruf, angka, garis bawah; diawali huruf atau garis bawah; maksimal 64 karakter.
- Maksimal 20 variabel per penerima.
- Nilai variabel maksimal 1.000 karakter.
- Kalau template memakai `{{name}}` tetapi CSV tidak punya kolom `name`, dashboard menolak broadcast. Perbaiki CSV dulu.

### Langkah 5 — Pratinjau

Klik **Preview** untuk melihat beberapa variasi pesan sebelum dikirim. Periksa:

1. Sapaan tidak terpotong.
2. Variabel terisi, bukan `{{name}}` mentah.
3. Link utuh.
4. Tidak ada karakter aneh akibat CSV.

### Langkah 6 — Kirim dan pantau

Klik **Kirim broadcast**. Status yang akan Anda lihat:

| Status | Arti |
| --- | --- |
| `DRAFT` | Tersimpan, belum dijalankan |
| `QUEUED` | Masuk antrean |
| `RUNNING` | Sedang mengirim |
| `PAUSED` | Dijeda manual |
| `COMPLETED` | Selesai |
| `CANCELLED` | Dibatalkan |
| `FAILED` | Gagal total |

Anda bisa **Pause** dan **Resume** broadcast yang sedang berjalan. Progres menampilkan total, terkirim, gagal, dilewati, dan sisa.

## Broadcast lewat API

### Membuat broadcast

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/broadcasts" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: promo-2026-10-31-001" \
  -d '{
    "sessionId": "cs-utama",
    "name": "Promo Oktober",
    "recipients": ["628123456789", "628987654321"],
    "message": "{Halo|Hai} {{name}}, promo Oktober sudah dimulai.",
    "delayMinMs": 10000,
    "delayMaxMs": 20000,
    "requireOptIn": false
  }'
```

Dengan personalisasi:

```json
{
  "sessionId": "cs-utama",
  "name": "Tagihan November",
  "recipientData": [
    { "recipient": "628123456789", "variables": { "name": "Ayu", "invoice_no": "INV-001" } },
    { "recipient": "628987654321", "variables": { "name": "Budi", "invoice_no": "INV-002" } }
  ],
  "message": "Halo {{name}}, invoice {{invoice_no}} sudah terbit.",
  "delayMinMs": 10000,
  "delayMaxMs": 20000
}
```

Aturan penting:

- `recipients` **atau** `recipientData`, jangan keduanya.
- Maksimal 5.000 penerima per request, tetapi batas paket Anda bisa lebih rendah.
- `delayMinMs` minimal 2.000 dan maksimal 60.000.
- `delayMaxMs` minimal 2.000 dan maksimal 120.000, harus ≥ `delayMinMs`.
- `Idempotency-Key` wajib, 8–128 karakter URL-safe. Kirim ulang dengan key yang sama tidak membuat broadcast ganda.

### Melihat daftar broadcast

```bash
curl "https://wagateway.kingofcoding.my.id/api/v1/broadcasts?sessionId=cs-utama&limit=25" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"
```

### Menjeda dan melanjutkan

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/broadcasts/BROADCAST_ID/pause" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"

curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/broadcasts/BROADCAST_ID/resume" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"
```

### Import CSV lewat API

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/broadcasts/recipients/import" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: text/csv" \
  --data-binary @penerima.csv
```

Respons berisi `recipients`, `recipientData`, `rowsRead`, `duplicatesRemoved`, `groupsExcluded`, dan daftar header. Periksa `rowsRead` dan `duplicatesRemoved` sebelum membuat broadcast.

### Pratinjau spintax

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/broadcasts/spintax/preview" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "{Halo|Hai} {{name}}, promo {mulai|dimulai} hari ini.",
    "count": 5,
    "variables": { "name": "Ayu" }
  }'
```

## Opt-in dan suppression

### Opt-in

Kalau `requireOptIn` aktif, PesanPro hanya mengirim ke kontak yang punya status `OPTED_IN` di perangkat tersebut. Penerima lain dilewati dengan kode `OPT_IN_REQUIRED`.

Gunakan opt-in kalau:

- Anda membeli/ mengumpulkan daftar dari beberapa sumber dan tidak yakin semuanya setuju.
- Anda ingin audit trail yang lebih kuat.
- Anda menjalankan program loyalitas dengan persetujuan eksplisit.

### Suppression

Suppression adalah daftar nomor yang **tidak boleh** dikirimi broadcast. Tambahkan nomor yang:

- Membalas `STOP` atau meminta berhenti.
- Mengeluh merasa dispam.
- Nomor internal tim Anda (kalau tidak ingin menerima promo).

Di dashboard, buka bagian **Suppression** pada halaman Broadcast. Di API:

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/suppressions" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "recipient": "628123456789", "reason": "MANUAL" }'
```

Penerima yang masuk suppression akan dilewati dengan kode `RECIPIENT_SUPPRESSED`.

## Kesalahan umum dan artinya

| Kode / pesan | Penyebab | Perbaikan |
| --- | --- | --- |
| `BROADCAST_RECIPIENT_LIMIT_EXCEEDED` | Penerima melebihi batas paket | Kurangi penerima atau naik paket |
| `BROADCAST_DELAY_BELOW_MINIMUM` | Jeda lebih kecil dari minimum paket | Naikkan jeda |
| `MISSING_BROADCAST_VARIABLE` | Template memakai variabel yang tidak ada di CSV | Lengkapi kolom CSV |
| `INVALID_RECIPIENT_CSV` | Format CSV salah, terlalu besar, atau terlalu banyak kolom | Perbaiki file; maksimal 2 MB dan 20 kolom |
| `QUOTA_EXCEEDED` | Kuota pesan bulanan habis | Tunggu periode berikutnya atau naik paket |
| `ENTITLEMENT_DENIED` | Paket belum aktif atau fitur tidak termasuk | Selesaikan pembayaran / naik paket |
| `RECIPIENT_SUPPRESSED` | Nomor ada di suppression | Hapus dari suppression kalau memang sudah setuju |
| `OPT_IN_REQUIRED` | Kontak belum `OPTED_IN` | Minta persetujuan atau matikan `requireOptIn` |

## Praktik aman mengirim broadcast

1. **Mulai kecil.** Kirim ke 10–20 penerima dulu, lihat hasilnya, baru naik.
2. **Hindari jam malam.** Kirim antara 08.00–20.00 waktu setempat.
3. **Jangan kirim ke daftar beli.** Daftar tanpa izin mempercepat nomor diblokir.
4. **Variasikan pesan.** Gunakan spintax dan variabel.
5. **Jeda cukup.** Untuk nomor baru, gunakan 20–40 detik. Untuk nomor matang, 10–20 detik.
6. **Pantau kegagalan.** Kalau lebih dari 10% gagal dengan kode yang sama, hentikan dan perbaiki.
7. **Simpan bukti opt-in.** Kalau pelanggan mengeluh, Anda bisa menunjukkan dasar pengiriman.

## Alur singkat

```
Siapkan daftar (CSV) → Import → Tulis pesan + variabel + spintax
   → Preview → Atur jeda → Kirim → Pantau status
   → Pause kalau ada masalah → Perbaiki → Resume
```
