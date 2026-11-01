# 03 — Auto-reply

Auto-reply membalas pesan masuk secara otomatis ketika isi pesan cocok dengan aturan yang Anda buat. Cocok untuk sapaan, daftar harga, jam buka, alamat, dan pertanyaan yang berulang.

Menu di sidebar bernama **Balasan Otomatis** (`/dashboard/autoreply`). Judul di dalam halamannya adalah **Auto Reply Studio**. Keduanya menunjuk ke halaman yang sama.

Panduan ini menjelaskan semua field, cara kerja pemilihan aturan, log dan kode alasan, sapaan otomatis, dan contoh yang bisa langsung dipakai.

## Membuat aturan lewat dashboard

1. Buka menu **Balasan Otomatis**.
2. Pilih perangkat.
3. Isi kartu **Buat rule aman** (lihat daftar field di bawah).
4. Klik **Buat rule**.
5. Untuk mengubah aturan yang sudah ada, klik **Edit** pada kartu aturan; formulir berubah menjadi mode edit dan tombolnya menjadi **Simpan versi baru**. Setiap perubahan menaikkan nomor versi aturan.
6. Untuk menghapus, klik **Hapus** lalu konfirmasi. Aturan yang dihapus tetap menyimpan log historis.
7. Untuk menonaktifkan sementara, pakai sakelar **Aktif** di formulir atau sakelar di kartu aturan. Aturan nonaktif tetap tersimpan.
8. Uji aturan di kartu **Preview tanpa kirim**: isi contoh pesan masuk, pilih **Simulasikan pesan group** kalau perlu, lalu klik **Uji rule**. Hasilnya hanya menunjukkan aturan mana yang menang — tidak ada pesan dikirim.

Field di formulir, dengan nama persis seperti di layar:

| Field di layar | Wajib | Nilai yang diterima | Arti |
| --- | --- | --- | --- |
| `Nama rule` | Tidak | 2–100 karakter | Nama aturan, untuk Anda sendiri |
| `Match type` | Ya | `Exact`, `Contains`, `Starts with`, `Safe regex`, `Fallback` | Cara mencocokkan (nilai tersimpan: `EXACT`, `CONTAINS`, `STARTS_WITH`, `REGEX`, `FALLBACK`) |
| `Audience` | Ya | `Semua`, `Private`, `Group` | Berlaku di mana (nilai tersimpan: `ALL`, `PRIVATE`, `GROUP`) |
| `Keyword / pola` | Ya, kecuali Fallback | Maksimal 100 karakter; nonaktif otomatis saat Match type Fallback | Kata/frasa yang dicari |
| `Balasan` | Ya, atau media | Maksimal 4.096 karakter | Teks balasan |
| MediaPicker | Tidak | File media milik Anda | Lampiran balasan |
| `Prioritas` | Ya | 0–10.000, default 100 | Semakin besar, semakin diprioritaskan |
| `Timezone` | Ya | Zona IANA, default `Asia/Jakarta` | Dasar perhitungan jadwal |
| `Hari aktif ISO` | Tidak | Angka 1–7 dipisah koma, mis. `1,2,3,4,5` | Hari aktif; 1 = Senin, 7 = Minggu |
| `Mulai` | Tidak | `HH:mm` | Awal jadwal; wajib diisi berdua dengan `Selesai` |
| `Selesai` | Tidak | `HH:mm` | Akhir jadwal |
| `Cooldown (detik)` | Ya | 0–86.400, default 30 | Jeda minimum untuk kontak yang sama |
| `Rate / window` | Ya | Dua kolom: jumlah (1–100, default 5) dan detik (10–86.400, default 60) | Batas balasan per jendela waktu |
| `Max chain depth` | Ya | 1–20, default 3 | Maksimal balasan beruntun |
| `Aktif` | Ya (sakelar) | Nyala/mati | Rule aktif atau tidak |

Setiap kartu aturan menampilkan: nama (atau kata kunci, atau "Fallback"), badge `Match type`, badge `P<prioritas>`, badge `v<versi>`, cuplikan balasan, dan baris `Audience · Timezone · cooldown`.

Di bawah halaman ada kartu **Trigger log terbaru** dengan kolom: `Waktu`, `Pengirim (disamarkan)`, `Pesan`, `Status`, `Alasan`, `Job`.

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

Kolom **Status** bisa bernilai:

| Status | Arti |
| --- | --- |
| `PENDING` | Masuk antrean pemrosesan auto-reply, belum diproses |
| `PROCESSING` | Sedang diproses worker |
| `ENQUEUED` | Lolos semua pemeriksaan; balasan sudah masuk antrean pesan |
| `SKIPPED` | Dilewati; lihat kolom **Alasan** |
| `FAILED` | Gagal diproses setelah beberapa percobaan; lihat kolom **Alasan** |

Kolom **Alasan** (reason code) bisa bernilai:

| Alasan | Arti |
| --- | --- |
| `ENQUEUED` | Balasan berhasil masuk antrean pesan |
| `MATCHED` | Cocok dengan aturan (dipakai saat evaluasi/preview) |
| `NO_MATCH` | Tidak cocok dengan aturan (dipakai saat evaluasi/preview) |
| `NO_RULE_MATCHED` | Tidak ada aturan yang cocok dengan pesan ini |
| `RULE_DISABLED` | Aturan dimatikan |
| `AUDIENCE_MISMATCH` | Aturan grup/private tidak sesuai jenis chat pengirim |
| `OUTSIDE_SCHEDULE` | Di luar hari/jam aktif, atau tidak ada aturan yang aktif di jadwal ini |
| `UNSAFE_REGEX` | Regex ditolak karena tidak memenuhi batasan keamanan |
| `COOLDOWN_ACTIVE` | Kontak yang sama masih dalam masa jeda aturan ini |
| `CONTACT_RATE_LIMITED` | Batas balasan per jendela waktu untuk kontak ini tercapai |
| `CHAIN_LIMIT_REACHED` | Batas balasan beruntun untuk kontak ini tercapai |
| `RECIPIENT_SUPPRESSED` | Pengirim ada di daftar jangan kirim |
| `BOT_DISABLED` | Bot/perangkat dimatikan sehingga auto-reply tidak jalan |
| `OWNER_MODE_IGNORES_INBOUND` | Perangkat dalam mode OWNER; pesan masuk diabaikan |
| `SENDER_NOT_ALLOWED` | Mode akses SPECIFIC: pengirim tidak ada di daftar yang diizinkan |
| `SENDER_BLOCKED` | Mode akses BLACKLIST: pengirim ada di daftar yang diblokir |
| `MEDIA_UNAVAILABLE` | Media pada aturan sudah tidak tersedia |
| `EMPTY_RESPONSE` | Aturan tidak punya teks balasan maupun media |
| `ENTITLEMENT_DENIED` | Paket tidak mencakup fitur auto-reply atau paket tidak aktif |
| `MESSAGE_QUOTA_EXCEEDED` | Kuota pesan paket habis |
| `MAX_ATTEMPTS_EXCEEDED` | Pemrosesan melewati batas percobaan ulang |

Alasan yang diteruskan ke log saat tidak ada aturan yang cocok diringkas menjadi satu dari: `OUTSIDE_SCHEDULE` (semua aturan nonaktif atau di luar jadwal), `UNSAFE_REGEX` (ada regex yang ditolak), atau `NO_RULE_MATCHED`.

## Batas jumlah aturan

| Paket | Aturan auto-reply |
| --- | --- |
| Starter | 10 |
| Bisnis | 50 |
| Pro | Tanpa batas |

Kalau batas tercapai, API mengembalikan `AUTOREPLY_RULE_LIMIT_REACHED`. Hapus aturan yang tidak dipakai atau naik paket.

## Sapaan otomatis: dua hal yang berbeda

Ada dua "sapaan" di PesanPro. Jangan dicampur.

### 1. Welcome message perangkat

Ini pesan sapaan bawaan perangkat, bukan aturan auto-reply. Perilakunya sesuai kode:

- Hanya dikirim ke **chat pribadi** (bukan grup, bukan status).
- Hanya dikirim untuk **pesan masuk** (bukan pesan yang dikirim sendiri).
- Dikirim **paling banyak satu kali per kontak**, selamanya. Penandanya tersimpan di data kontak, sehingga kontak yang kembali lama setelah penghapusan pesan lama tetap tidak menerima sapaan ulang.
- Tidak bergantung pada kata kunci: pesan pertama apa pun dari kontak baru bisa memicunya.
- Jika terjadi gangguan server tepat pada saat pengiriman, sapaan bisa terlewat (tidak dikirim ulang) — sistem sengaja memilih "gagal aman" agar tidak pernah mengirim sapaan dobel.

**Tidak ditemukan di kode yang diperiksa:** halaman atau API untuk mengisi isi welcome message dari dashboard. Pengaturan ini ada di data perangkat, tetapi tidak ada formulir yang menuliskannya. Artinya, jangan menghitung fitur ini aktif sampai pemilik mengonfirmasi cara mengisinya. Lihat daftar BELUM TERVERIFIKASI pada laporan pendamping.

### 2. Aturan auto-reply sapaan buatan Anda

Ini aturan biasa yang Anda buat sendiri, misalnya aturan dengan kata kunci `halo` (Match type `Exact`) atau `assalamualaikum` (Match type `Contains`). Aturan ini mengikuti **semua** ketentuan auto-reply di halaman ini: keyword wajib, jadwal aktif, prioritas, cooldown, rate limit, dan log. Ia bisa mengirim sapaan berkali-kali ke kontak yang sama selama batas pengaman belum tercapai — berbeda dari welcome message perangkat yang maksimal satu kali.

Kalau Anda mengaktifkan keduanya, kontak baru bisa menerima dua pesan: welcome message perangkat dan balasan aturan Anda. Rencanakan isi keduanya supaya tidak duplikatif.

## Glosarium

| Istilah | Arti dalam bahasa sehari-hari | Contoh |
| --- | --- | --- |
| `Rule` / aturan | Sepasang "kalau pesan seperti ini, balas seperti itu" | Kata kunci `harga`, balasan daftar harga |
| `Match type` | Cara PesanPro membandingkan pesan masuk dengan kata kunci | `EXACT` harus sama persis |
| `EXACT` | Pesan harus sama persis dengan kata kunci (huruf besar/kecil diabaikan, spasi di ujung diabaikan) | `halo`, `HALO` cocok; `halo kak` tidak |
| `CONTAINS` | Pesan mengandung kata kunci di bagian mana pun | `berapa harga?` cocok dengan `harga` |
| `STARTS_WITH` | Pesan diawali kata kunci | `pesan 2 nasi` cocok dengan `pesan` |
| `REGEX` / `Safe regex` | Pola pencocokan lanjutan yang dibatasi agar aman | `^INV-[0-9]{4}$` |
| `FALLBACK` | Balasan cadangan saat tidak ada aturan lain yang cocok | "Ketik harga atau alamat" |
| `Trigger type` / `Audience` | Jenis chat tempat aturan berlaku: semua, pribadi, atau grup | `PRIVATE` hanya chat pribadi |
| `Prioritas` | Angka penentu aturan mana yang menang saat lebih dari satu cocok | 200 mengalahkan 100 |
| `Version` (`v`) | Nomor perubahan aturan; naik setiap kali disimpan ulang | `v3` = sudah diedit dua kali |
| `Timezone` | Zona waktu untuk hitungan hari dan jam aturan | `Asia/Jakarta` |
| `Hari aktif ISO` | Daftar hari aktif dengan angka ISO: 1 = Senin sampai 7 = Minggu | `1,2,3,4,5` = Senin–Jumat |
| `Cooldown (detik)` | Jeda minimum sebelum aturan yang sama membalas kontak yang sama lagi | 60 = maksimal sekali per menit per kontak |
| `Rate / window` | Batas jumlah balasan dalam satu jendela waktu (detik) per kontak | 5 balasan per 60 detik |
| `Max chain depth` | Batas balasan beruntun dalam satu jendela waktu per kontak | 3 = maksimal 3 kali beruntun |
| `Aktif` / `isEnabled` | Sakelar nyala/mati aturan; aturan mati tetap tersimpan | Matikan saat promosi selesai |
| `Trigger log` | Catatan setiap pesan masuk yang diproses auto-reply, beserta status dan alasannya | "Kenapa tidak dibalas?" cek di sini |
| `Status log` | Tahapan pemrosesan: `PENDING`, `PROCESSING`, `ENQUEUED`, `SKIPPED`, `FAILED` | `SKIPPED` = dilewati |
| `Reason code` / Alasan | Kode penyebab kenapa balasan jalan atau tidak | `COOLDOWN_ACTIVE` |
| `Preview tanpa kirim` | Alat uji di dashboard yang mengecek aturan mana yang menang tanpa mengirim pesan | Isi contoh pesan, klik `Uji rule` |
| `Suppression` | Daftar nomor yang tidak boleh dikirimi; pengirim di daftar ini tidak dibalas auto-reply | Pelanggan yang membalas `STOP` |
| `Kuota pesan` | Jumlah pesan bulanan paket Anda; auto-reply ikut memakainya | Habis → `MESSAGE_QUOTA_EXCEEDED` |
| `Limit aturan` | Batas jumlah aturan aktif sesuai paket: Starter 10, Bisnis 50, Pro tanpa batas | Habis → `AUTOREPLY_RULE_LIMIT_REACHED` |
| `Idempotent` | Pesan masuk yang sama tidak diproses dua kali | Kirim ulang event tidak membuat balasan dobel |

## Checklist sebelum mengaktifkan

1. Kata kunci tidak terlalu umum. `info` akan menangkap terlalu banyak pesan.
2. Prioritas tidak bertabrakan.
3. Cooldown cukup panjang untuk mencegah spam balasan.
4. Fallback mengarahkan ke langkah berikutnya, bukan hanya "maaf".
5. Sudah diuji lewat **Preview tanpa kirim**.
6. Sudah diuji dari nomor lain di WhatsApp.
7. Log dipantau pada hari pertama.
