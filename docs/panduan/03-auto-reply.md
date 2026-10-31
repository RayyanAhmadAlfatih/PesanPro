# 03 — Auto-reply

Auto-reply membalas pesan masuk secara otomatis ketika isi pesan cocok dengan aturan yang Anda buat. Cocok untuk sapaan, daftar harga, jam buka, alamat, dan pertanyaan yang berulang.

Panduan ini menjelaskan semua field, cara kerja pemilihan aturan, dan contoh yang bisa langsung dipakai.

## Cara kerja singkat

```
Pesan masuk
   → cek perangkat aktif
   → cek aturan mana yang cocok (prioritas tertinggi menang)
   → cek jadwal aktif (hari + jam)
   → cek cooldown dan rate limit per kontak
   → kirim balasan
   → catat log
```

Yang perlu dipahami:

1. **Satu pesan masuk hanya dibalas satu aturan.** Aturan dengan prioritas tertinggi yang menang.
2. **Fallback hanya dipakai kalau tidak ada aturan biasa yang cocok.**
3. **Cooldown mencegah balasan berulang** ke kontak yang sama dalam waktu singkat.
4. **Rate limit dan chain depth mencegah loop** balasan otomatis.

## Anatomi satu aturan

| Field | Wajib | Nilai yang diterima | Arti |
| --- | --- | --- | --- |
| `name` | Tidak | 2–100 karakter | Nama aturan, untuk Anda sendiri |
| `keyword` | Ya, kecuali FALLBACK | Maksimal 100 karakter | Kata/frasa yang dicari |
| `matchType` | Ya | `EXACT`, `CONTAINS`, `STARTS_WITH`, `REGEX`, `FALLBACK` | Cara mencocokkan |
| `response` | Ya, atau `mediaId` | Maksimal 4.096 karakter | Teks balasan |
| `mediaId` | Tidak | ID media | Lampiran balasan |
| `triggerType` | Ya | `ALL`, `GROUP`, `PRIVATE` | Berlaku di mana |
| `priority` | Ya | 0–10.000, default 100 | Semakin besar, semakin diprioritaskan |
| `timezone` | Ya | Zona IANA, mis. `Asia/Jakarta` | Dasar perhitungan jadwal |
| `activeDays` | Tidak | `[1..7]` | 1 = Senin, 7 = Minggu |
| `activeStartTime` | Tidak | `HH:mm` | Awal jadwal |
| `activeEndTime` | Tidak | `HH:mm` | Akhir jadwal |
| `cooldownSeconds` | Ya | 0–86.400, default 30 | Jeda minimum untuk kontak yang sama |
| `rateLimitCount` | Ya | 1–100, default 5 | Maksimal balasan per jendela |
| `rateLimitWindowSeconds` | Ya | 10–86.400, default 60 | Panjang jendela rate limit |
| `maxChainDepth` | Ya | 1–20, default 3 | Maksimal balasan beruntun |
| `isEnabled` | Ya | `true` / `false` | Aktif atau tidak |

## Jenis pencocokan

### `EXACT`

Pesan harus sama persis dengan kata kunci, **tanpa membedakan huruf besar/kecil** dan spasi di awal/akhir diabaikan.

- Kata kunci: `halo`
- Cocok: `halo`, `Halo`, `HALO`, ` halo `
- Tidak cocok: `halo kak`, `hai`

Gunakan untuk sapaan dan perintah pendek.

### `CONTAINS`

Pesan mengandung kata kunci di mana saja.

- Kata kunci: `harga`
- Cocok: `harga`, `berapa harga?`, `minta harga dong`
- Tidak cocok: `biaya`

Gunakan untuk pertanyaan yang bervariasi.

### `STARTS_WITH`

Pesan diawali kata kunci.

- Kata kunci: `pesan`
- Cocok: `pesan 2 nasi goreng`, `Pesan sekarang`
- Tidak cocok: `saya mau pesan`

Gunakan untuk perintah berformat, misalnya `pesan <jumlah>`.

### `REGEX`

Pola regex untuk kebutuhan lanjutan. PesanPro membatasi regex agar aman dari pola yang bisa membuat server lambat.

Yang **boleh**:

- Anchor `^` dan `$`
- Karakter literal
- Kelas karakter `[0-9]`, `[a-z]`
- Quantifier tetap `{1}` sampai `{20}`
- Escape seperti `\.` dan `\-`

Yang **tidak boleh**:

- Lookaround `(?=...)`, `(?!...)`
- Named group `(?<nama>...)`
- Backreference `\1`
- Group `(...)`
- Alternasi `|`
- Quantifier tak terbatas `*` dan `+`
- Rentang `{2,}` atau `{2,5}`

Contoh aman:

```
^INV-[0-9]{4}$
```

Cocok: `INV-2026`, `INV-1234`.

### `FALLBACK`

Balasan cadangan ketika tidak ada aturan lain yang cocok. Kata kunci **harus kosong**.

Gunakan untuk:

- Mengarahkan pelanggan memilih menu.
- Memberi tahu jam operasional di luar jam kerja.
- Mencegah pelanggan tidak mendapat balasan sama sekali.

## Prioritas dan konflik

Aturan diurutkan berdasarkan:

1. `priority` terbesar.
2. Kalau sama, aturan yang lebih lama dibuat menang.
3. Kalau masih sama, ID aturan menentukan.

Contoh:

| Aturan | Prioritas | Hasil |
| --- | --- | --- |
| `promo` (CONTAINS) | 200 | Menang |
| `harga` (CONTAINS) | 100 | Kalah kalau pesan juga mengandung `promo` |
| `halo` (EXACT) | 100 | Hanya menang untuk pesan persis `halo` |

Kalau dua aturan punya kata kunci, jenis, dan prioritas yang sama, dashboard memberi peringatan `RULE_PRIORITY_CONFLICT`. Ubah prioritas salah satunya.

## Jadwal aktif

`activeDays` memakai angka ISO:

| Angka | Hari |
| --- | --- |
| 1 | Senin |
| 2 | Selasa |
| 3 | Rabu |
| 4 | Kamis |
| 5 | Jumat |
| 6 | Sabtu |
| 7 | Minggu |

Aturan jadwal:

- Kalau `activeDays` kosong, aturan aktif setiap hari.
- Kalau `activeStartTime` dan `activeEndTime` kosong, aturan aktif sepanjang hari.
- Kalau hanya salah satu waktu diisi, aturan ditolak.
- Jadwal yang melewati tengah malam didukung. Contoh: `22:00`–`02:00` aktif dari jam 22.00 sampai 02.00 hari berikutnya.
- Kalau `activeStartTime` sama dengan `activeEndTime`, aturan dianggap aktif sepanjang hari pada hari yang dipilih.

Contoh jam kerja:

```json
{
  "timezone": "Asia/Jakarta",
  "activeDays": [1, 2, 3, 4, 5],
  "activeStartTime": "08:00",
  "activeEndTime": "17:00"
}
```

Di luar jadwal, aturan tidak dijalankan. Kalau Anda ingin tetap ada balasan di luar jam kerja, buat aturan terpisah dengan jadwal `18:00`–`07:00` atau fallback.

## Cooldown, rate limit, dan chain depth

Tiga pengaman ini bekerja per kontak:

### Cooldown

Setelah aturan membalas satu kontak, aturan yang sama tidak membalas kontak itu lagi sampai cooldown habis.

- Default 30 detik.
- Set `0` untuk mematikan cooldown.
- Gunakan 60–300 detik untuk mencegah balasan beruntun saat pelanggan mengirim banyak pesan.

### Rate limit

Membatasi jumlah balasan dalam satu jendela waktu.

- Default 5 balasan per 60 detik.
- Kalau terlampaui, balasan berikutnya dilewati dengan alasan `CONTACT_RATE_LIMITED`.

### Chain depth

Membatasi berapa kali aturan boleh terpicu beruntun dalam satu jendela.

- Default 3.
- Kalau terlampaui, alasan `CHAIN_LIMIT_REACHED`.

Untuk kebanyakan usaha, nilai default sudah aman. Naikkan hanya kalau Anda yakin tidak menimbulkan loop.

## Contoh aturan siap pakai

### 1. Sapaan

```json
{
  "sessionId": "cs-utama",
  "name": "Sapaan",
  "keyword": "halo",
  "matchType": "EXACT",
  "response": "Halo Kak! Selamat datang di Toko Ayu. Ketik:\n1. harga\n2. alamat\n3. jam buka",
  "triggerType": "PRIVATE",
  "priority": 100,
  "timezone": "Asia/Jakarta",
  "cooldownSeconds": 60,
  "rateLimitCount": 3,
  "rateLimitWindowSeconds": 60,
  "maxChainDepth": 2,
  "isEnabled": true
}
```

### 2. Daftar harga

```json
{
  "sessionId": "cs-utama",
  "name": "Harga",
  "keyword": "harga",
  "matchType": "CONTAINS",
  "response": "Daftar harga:\n- Paket A: Rp50.000\n- Paket B: Rp90.000\n- Paket C: Rp150.000\n\nOngkir dihitung saat checkout.",
  "triggerType": "PRIVATE",
  "priority": 150,
  "timezone": "Asia/Jakarta",
  "cooldownSeconds": 30,
  "isEnabled": true
}
```

### 3. Alamat toko

```json
{
  "sessionId": "cs-utama",
  "name": "Alamat",
  "keyword": "alamat",
  "matchType": "CONTAINS",
  "response": "Toko kami di Jl. Merdeka No. 10, Bandung.\nMaps: https://maps.google.com/?q=-6.9,107.6\nBuka Senin–Sabtu 09.00–20.00.",
  "triggerType": "PRIVATE",
  "priority": 150,
  "timezone": "Asia/Jakarta",
  "isEnabled": true
}
```

### 4. Jam buka hanya di luar jam kerja

Aturan ini aktif setiap hari 18.00–07.00:

```json
{
  "sessionId": "cs-utama",
  "name": "Di luar jam kerja",
  "keyword": "jam buka",
  "matchType": "CONTAINS",
  "response": "Kami buka Senin–Sabtu 09.00–20.00. Pesan Anda kami balas besok pagi.",
  "triggerType": "PRIVATE",
  "priority": 200,
  "timezone": "Asia/Jakarta",
  "activeStartTime": "18:00",
  "activeEndTime": "07:00",
  "cooldownSeconds": 300,
  "isEnabled": true
}
```

### 5. Fallback

```json
{
  "sessionId": "cs-utama",
  "name": "Fallback",
  "keyword": "",
  "matchType": "FALLBACK",
  "response": "Maaf, kami belum memahami pesan Anda. Ketik salah satu:\n1. harga\n2. alamat\n3. jam buka\n\nAtau tunggu tim kami membalas.",
  "triggerType": "PRIVATE",
  "priority": 1,
  "timezone": "Asia/Jakarta",
  "cooldownSeconds": 300,
  "rateLimitCount": 2,
  "rateLimitWindowSeconds": 300,
  "maxChainDepth": 1,
  "isEnabled": true
}
```

### 6. Nomor invoice dengan regex

```json
{
  "sessionId": "cs-utama",
  "name": "Cek invoice",
  "keyword": "^INV-[0-9]{4}$",
  "matchType": "REGEX",
  "response": "Invoice Anda kami terima. Tim finance akan memeriksa dalam 1×24 jam.",
  "triggerType": "PRIVATE",
  "priority": 300,
  "timezone": "Asia/Jakarta",
  "isEnabled": true
}
```

### 7. Balasan dengan gambar

```json
{
  "sessionId": "cs-utama",
  "name": "Katalog",
  "keyword": "katalog",
  "matchType": "EXACT",
  "mediaId": "MEDIA_ID_DARI_UPLOAD",
  "response": "Ini katalog terbaru kami.",
  "triggerType": "PRIVATE",
  "priority": 150,
  "timezone": "Asia/Jakarta",
  "isEnabled": true
}
```

### 8. Hanya untuk grup

```json
{
  "sessionId": "cs-utama",
  "name": "Aturan grup",
  "keyword": "info",
  "matchType": "EXACT",
  "response": "Info grup: jangan kirim link di luar topik.",
  "triggerType": "GROUP",
  "priority": 100,
  "timezone": "Asia/Jakarta",
  "isEnabled": true
}
```

## Mengelola aturan lewat API

### Daftar aturan

```bash
curl "https://wagateway.kingofcoding.my.id/api/v1/autoreplies?sessionId=cs-utama" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"
```

### Membuat aturan

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/autoreplies" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "cs-utama",
    "name": "Harga",
    "keyword": "harga",
    "matchType": "CONTAINS",
    "response": "Daftar harga: https://toko.example.com/harga",
    "triggerType": "PRIVATE",
    "priority": 150,
    "timezone": "Asia/Jakarta",
    "cooldownSeconds": 30,
    "rateLimitCount": 5,
    "rateLimitWindowSeconds": 60,
    "maxChainDepth": 3,
    "isEnabled": true
  }'
```

### Mengubah dan menghapus

```bash
curl -X PUT "https://wagateway.kingofcoding.my.id/api/v1/autoreplies/RULE_ID" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "sessionId": "cs-utama", "keyword": "harga", "matchType": "CONTAINS", "response": "Harga baru: ...", "isEnabled": true }'

curl -X DELETE "https://wagateway.kingofcoding.my.id/api/v1/autoreplies/RULE_ID" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"
```

### Mengaktifkan / menonaktifkan

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/autoreplies/RULE_ID/toggle" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "sessionId": "cs-utama", "isEnabled": false }'
```

### Uji tanpa mengirim

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/autoreplies/preview" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "cs-utama",
    "text": "berapa harga paket B?",
    "isGroup": false
  }'
```

Respons menunjukkan aturan yang menang dan alasan aturan lain tidak dipakai. Gunakan ini sebelum mengaktifkan aturan di nomor produksi.

### Log pemicu

```bash
curl "https://wagateway.kingofcoding.my.id/api/v1/autoreplies/logs?sessionId=cs-utama&limit=50" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx"
```

Log membantu menjawab: "Kenapa pelanggan ini tidak dapat balasan?"

Alasan yang mungkin:

| Alasan | Arti |
| --- | --- |
| `MATCHED` | Cocok dan dibalas |
| `NO_MATCH` | Tidak cocok |
| `RULE_DISABLED` | Aturan dimatikan |
| `AUDIENCE_MISMATCH` | Aturan grup/private tidak sesuai |
| `OUTSIDE_SCHEDULE` | Di luar hari/jam aktif |
| `COOLDOWN_ACTIVE` | Masih dalam cooldown |
| `CONTACT_RATE_LIMITED` | Rate limit kontak tercapai |
| `CHAIN_LIMIT_REACHED` | Batas balasan beruntun tercapai |
| `UNSAFE_REGEX` | Regex ditolak |

## Batas jumlah aturan

| Paket | Aturan auto-reply |
| --- | --- |
| Starter | 10 |
| Bisnis | 50 |
| Pro | Tanpa batas |

Kalau batas tercapai, API mengembalikan `AUTOREPLY_RULE_LIMIT_REACHED`. Hapus aturan yang tidak dipakai atau naik paket.

## Checklist sebelum mengaktifkan

1. Kata kunci tidak terlalu umum. `info` akan menangkap terlalu banyak pesan.
2. Prioritas tidak bertabrakan.
3. Cooldown cukup panjang untuk mencegah spam balasan.
4. Fallback mengarahkan ke langkah berikutnya, bukan hanya "maaf".
5. Sudah diuji lewat **Preview**.
6. Sudah diuji dari nomor lain di WhatsApp.
7. Log dipantau pada hari pertama.
