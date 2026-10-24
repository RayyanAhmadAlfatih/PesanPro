# Prosedur QA Lanjutan PesanPro

**Tanggal:** 23 Oktober 2026
**Status:** rancangan — **belum ada tes yang dijalankan** untuk bab berikutnya.
**Dasar:** `ROADMAP-LIVE-TEST.md`, laporan QA 16–22 Oktober, dan hasil Fase 0.

---

## 1. Aturan kerja untuk fase ini

Aturan ini menggantikan kebiasaan "temukan → langsung perbaiki" untuk sementara,
sesuai permintaan pemilik pada 23 Oktober 2026.

1. **Tidak ada tes yang dijalankan sebelum pemilik menyetujui prosedur ini.**
2. **Kalau ada tes GAGAL:** berhenti. Catat bukti (request, status, response, sumber
   kedua), lalu **laporkan ke pemilik lebih dulu**. Jangan mengubah kode, konfigurasi,
   atau data sebelum pemilik memutuskan.
3. **Tidak menyentuh panel VPS, `.env`, nginx, database produksi, atau restart aplikasi.**
   Kalau sebuah tes membutuhkannya, masukkan ke daftar "menunggu pemilik".
4. **Bukti minimal dua sumber** untuk setiap kesimpulan: response API + dashboard/antrean,
   atau API + status job. Log pm2/DB hanya lewat pemilik.
5. **Bersihkan di tes yang sama:** aturan uji, API key uji, webhook uji, media uji,
   jadwal uji. Verifikasi daftar bersih sebelum menutup satu bab.
6. **Kirim WhatsApp hanya ke `6283877315731` dan `6285282348423`**, jeda 1–2 menit,
   penanda unik per tes, tidak ada pengiriman beruntun.
7. **Jangan klaim PASS tanpa eksekusi.** Bedakan: terbukti / diduga / belum diuji.

---

## 2. Temuan audit: jumlah tes di roadmap tidak lagi 427

Roadmap menyebut "427 tes", tetapi isi dokumen sekarang **490 tes**:

| Bagian | Jumlah | Keterangan |
| --- | --- | --- |
| L0 | 16 | |
| L1 | **63** | 26 tes awal + 37 tes tambahan (umur sesi, OTP, harga/trial) |
| L2 | 21 | |
| L3 | 25 | |
| L4 | 25 | |
| L5 | 12 | |
| L6 | 18 | |
| L7 | 12 | N/A (dipensiunkan) |
| L8 | 15 | |
| L9 | 32 | |
| L10 | 27 | N/A (dipensiunkan) |
| L11 | 18 | |
| L12 | 27 | |
| L13 | 32 | |
| L14 | 30 | |
| L15 | **24** | 12 Google Forms + 12 Contact Form 7 (bukan 12 total) |
| L16 | 23 | |
| L17 | **44** | 30 tes + 14 tes popup What's New |
| L18 | 26 | |
| **Total** | **490** | |

Selisih dari angka lama 427 = **63 tes**: 37 tes L1 tambahan, 12 tes CF7 di L15, dan
14 tes What's New di L17. **Ketiganya belum pernah masuk hitungan QA.** Ini yang paling
mudah terlewat kalau kita hanya berpegang pada angka 427.

---

## 3. Audit cakupan QA sebelumnya

Kolom "bukti per ID" menilai apakah laporan lama menyebut ID tes satu per satu,
bukan hanya ringkasan bab.

| Bab | Tes | Status laporan | Bukti per ID | Celah |
| --- | --- | --- | --- | --- |
| L0 | 16 | "sebagian" | Hampir tidak ada | 13 tes belum punya bukti; L0-03/04/06 baru terbukti 23 Okt |
| L1 | 63 | "sebagian" | Hanya login dasar | 37 tes baru (sesi/OTP/harga) **belum pernah dijalankan** |
| L2 | 21 | "tuntas" | 5 dari 21 disebut | 16 ID belum dirinci (L2-01..07, 09, 13..21) |
| L3 | 25 | "tuntas" | ±6 dari 25 disebut | L3-01, 06..10, 13..25 belum dirinci |
| L4 | 25 | 24/25 | Baik | L4-17 belum |
| L5 | 12 | tuntas | Baik (9 PASS, 3 N/A) | — |
| L6 | 18 | tuntas | Baik (semua ID disebut) | — |
| L7 | 12 | N/A | — | Jangan dijalankan |
| L8 | 15 | 13/15 | Baik | L8-15 belum |
| L9 | 32 | tuntas | Sebagian (beberapa ID) | Perlu rekap per ID, bukan tes ulang |
| L10 | 27 | N/A | — | Jangan dijalankan |
| L11 | 18 | tuntas | Baik | — |
| L12 | 27 | 25/27 | Baik | L12-21 belum |
| L13 | 32 | belum | — | **0 tes** |
| L14 | 30 | 25 PASS, 1 FAIL, 1 N/A | Baik | 14, 18, 20, 30 terblokir |
| L15 | 24 | belum | — | **0 tes** |
| L16 | 23 | 7 PASS, 1 N/A | Baik | 15 tes terblokir (superadmin/grace/payment) |
| L17 | 44 | belum | — | **0 tes** |
| L18 | 26 | belum | — | **0 tes** |

### 3.1 Daftar celah yang wajib ditutup (jangan sampai terlewat)

**A. Belum dijalankan sama sekali — 126 tes**

| Bab | ID | Jumlah |
| --- | --- | --- |
| L13 Webhook | L13-01 … L13-32 | 32 |
| L15 Integrasi | L15-G01…G12, L15-C01…C12 | 24 |
| L17 Users/Settings/Notif | L17-01…L17-44 | 44 |
| L18 Ketahanan | L18-01…L18-26 | 26 |

**B. Terblokir — 19 tes**

| ID | Blocker |
| --- | --- |
| L14-14 | Slot API key tenant A penuh 2/2; butuh satu slot kosong atau ubah `expiresAt` di DB |
| L14-18 | `TRUST_PROXY` belum aktif di `.env` |
| L14-20 | Mesin QA tidak punya jalur IPv6 |
| L14-30 | Butuh akun SUPERADMIN |
| L16-07 | Butuh langganan kedaluwarsa terkontrol (ubah tanggal di DB) |
| L16-09 | Pengajuan bukti bayar meninggalkan baris PENDING; butuh admin untuk membersihkan |
| L16-11…L16-23 | Butuh akun SUPERADMIN |

**C. Sisa kecil — 3 tes**

`L4-17` (429 unggahan paralel), `L8-15` (media bertahan setelah restart),
`L12-21` (max chain depth; butuh dua bot saling membalas).

**D. Klaim "tuntas" yang buktinya belum per ID — perlu rekap/verifikasi**

L0 (16), L1 (63), L2 (21), L3 (25), L9 (32), L11 (18). Untuk L9/L11 bukti sudah kuat
secara naratif; yang kurang adalah pemetaan per ID. Untuk L0/L1/L2/L3, sebagian tes
benar-benar belum pernah dijalankan.

**E. Kesalahan hitung yang perlu dikoreksi di roadmap**

- Judul "427 tes" → **490 tes**.
- L1 tertulis 26 di laporan → **63**.
- L15 tertulis 12 di laporan → **24**.
- L17 tertulis 30 di laporan → **44** (termasuk What's New).

---

## 4. Urutan kerja yang diusulkan

| Urutan | Bab | Alasan |
| --- | --- | --- |
| 1 | **L13 Webhook (32)** | Sesuai urutan lanjutan; menyentuh integrasi pelanggan |
| 2 | **L17 Users/Settings/Notif (44)** | Pengalaman harian pelanggan |
| 3 | **L18 Ketahanan (26)** | Gerbang akhir sebelum jual |
| 4 | **L15 Integrasi (24)** | Setelah keputusan apakah dipasarkan |
| 5 | **Backfill L2 (P0) + L1 + L0 + L3** | Menutup klaim tanpa bukti per ID |
| 6 | Sisa L4-17, L8-15, L12-21 + 19 blocked | Setelah pemilik membuka akses |

Backfill L2 ditempatkan setelah L18 karena bukan bab baru, tetapi **wajib selesai
sebelum release**. Kalau pemilik ingin lebih aman, backfill L2 bisa dinaikkan ke urutan 1.

---

## 5. Prosedur L13 — Webhook Engine (32 tes)

### 5.1 Prasyarat

- Login **Tenant B** (`testinguserb@gmail.com`), sesi `qa-b-session` `CONNECTED`.
- Cek `/api/billing/summary`: kalau `WEBHOOKS` = 1 (paket trial), semua tes dijalankan
  **berurutan dengan satu endpoint**, bukan membuat banyak endpoint sekaligus.
- Siapkan penerima uji:
  - **Receiver A** untuk payload/signature: `https://webhook.site/<token>` (atau URL
    milik pemilik kalau disediakan).
  - **Receiver B** untuk kegagalan: `https://httpbin.org/status/500`.
  - **Receiver C** untuk timeout: `https://httpbin.org/delay/15` dengan `timeoutMs=1000`.
- Hanya data uji. Tidak ada pesan ke nomor selain dua nomor uji.
- Event `campaign.status` (L13-19): Campaign sudah dipensiunkan → **N/A beralasan**.

### 5.2 Endpoint yang dipakai

| Fungsi | Endpoint |
| --- | --- |
| List / Create | `GET/POST /api/webhooks/{sessionId}` |
| Update / Delete | `PUT/DELETE /api/webhooks/{sessionId}/{id}` |
| Test | `POST /api/webhooks/{sessionId}/{id}/test` |
| Rotate secret | `POST /api/webhooks/{sessionId}/{id}/rotate-secret` |
| Logs | `GET /api/webhooks/{sessionId}/{id}/logs` |
| Replay | `POST /api/webhooks/{sessionId}/{id}/deliveries/{deliveryId}/replay` |

Body create: `{name, url, secret?, events[], maxAttempts?, timeoutMs?}`.
Signature: `X-PesanPro-Signature: v1=<hex>`, dihitung
`HMAC-SHA256(secret, "<timestamp>.<eventId>.<rawBody>")`.
Header lain: `X-PesanPro-Timestamp`, `X-PesanPro-Event-Id`, `X-PesanPro-Delivery-Id`,
`X-PesanPro-Payload-Version`. Setelah rotasi, `X-PesanPro-Signature-Previous` berlaku 24 jam.
Retry default: `maxAttempts=8`, `timeoutMs=10000`, backoff 2 detik eksponensial + jitter
(maksimum 15 menit).

### 5.3 Grup A — CRUD & secret

| ID | Langkah | Bukti | Bersihkan |
| --- | --- | --- | --- |
| L13-01 | `POST` endpoint HTTPS + `events:["message.received"]` | `201`, `id` dibuat, muncul di `GET` | Hapus di akhir |
| L13-02 | `POST` tanpa `events` | `422` validasi, tidak ada baris baru | — |
| L13-03 | Lihat response create, lalu `GET` list | Secret `whsec_…` hanya di response create; list hanya preview | — |
| L13-04 | `POST` dengan `secret` 32+ karakter, lalu `/test` | `201`; signature `/test` valid dengan secret itu | Hapus |
| L13-27 | `PUT` URL + events baru, lalu `/test` | Receiver baru menerima; receiver lama tidak | Kembalikan/hapus |
| L13-28 | `POST /rotate-secret`, lalu `/test` | Secret baru valid; `X-PesanPro-Signature-Previous` ada | — |
| L13-29 | Verifikasi signature previous dengan secret lama | Valid dalam 24 jam; kedaluwarsa setelah 24 jam | Butuh tunggu/DB → catat sebagai **sebagian** |
| L13-30 | `DELETE`, lalu `GET` list dan `/test` | List kosong; `/test` → `404` | — |

### 5.4 Grup B — Pengiriman, signature, log

| ID | Langkah | Bukti |
| --- | --- | --- |
| L13-05 | `POST /test` | Receiver menerima event uji; response `2xx` |
| L13-06 | Hitung ulang HMAC dari raw body + header | Sama dengan `v1=…`; body diubah → tidak cocok |
| L13-22 | `GET /logs` setelah beberapa delivery | Payload, status response, header, latency, attempt terlihat |

### 5.5 Grup C — Payload per event

| ID | Cara memicu | Catatan |
| --- | --- | --- |
| L13-07 `message.received` | Kirim WA dari `6285282348423` ke bot | 1 pesan, jeda normal |
| L13-08 `message.sent` | Kirim via `/api/v1/messages/text` ke `6283877315731` | 1 pesan |
| L13-09 `message.status` | Tunggu status `DELIVERED/READ` dari pesan L13-08 | Otomatis |
| L13-10 `connection.update` | Stop/start sesi **butuh izin** | Berisiko; jadwalkan terpisah |
| L13-11 `group.update` | Ubah subject grup uji | Butuh grup uji |
| L13-12 `group.participant` | Tambah/keluarkan nomor uji dari grup | Butuh grup + admin |
| L13-13 `contact.update` | Ubah nama kontak di HP | Butuh aksi HP |
| L13-14 `status.update` | Posting status WhatsApp | Butuh aksi HP |
| L13-15 `message.edited` | Edit pesan yang sudah terkirim | Butuh aksi HP |
| L13-16 `message.deleted` | Hapus untuk semua | Butuh aksi HP |
| L13-17 `schedule.status` | Buat jadwal +1 menit | 1 jadwal, lalu hapus |
| L13-18 `broadcast.status` | Broadcast 2 penerima (kedua nomor uji) | 1 putaran saja |
| L13-19 `campaign.status` | — | **N/A** — Campaign dipensiunkan |

Event yang butuh aksi HP (10–16) ditandai **BLOCKED-PEMILIK** kalau pemilik tidak bisa
membantu memicunya. Jangan memaksa dengan mengubah sesi.

### 5.6 Grup D — Kegagalan, retry, replay

| ID | Langkah | Bukti |
| --- | --- | --- |
| L13-20 | Endpoint `httpbin/status/500`, `maxAttempts=2` | Dua attempt, status `FAILED`, error tercatat, tidak ada duplikat |
| L13-21 | `httpbin/delay/15`, `timeoutMs=1000` | Timeout tercatat, retry aman, tidak menggandakan event |
| L13-23 | `POST replay` pada delivery gagal | Delivery baru dibuat; log lama tidak berubah |
| L13-24 | `POST replay` pada delivery sukses | Ditolak/no-op; log lama tidak berubah |
| L13-31 | Restart worker webhook | Outbox tidak hilang/duplikat | **Butuh pemilik** (restart) |

### 5.7 Grup E — Enable/disable

| ID | Langkah | Bukti |
| --- | --- | --- |
| L13-25 | Nonaktifkan endpoint, kirim satu pesan uji | Tidak ada delivery baru |
| L13-26 | Aktifkan lagi, kirim satu pesan uji | Delivery masuk lagi |

### 5.8 Grup F — Isolasi tenant

| ID | Langkah | Bukti |
| --- | --- | --- |
| L13-32 | Webhook Tenant B diakses dengan sesi/key Tenant A: `GET`, `PUT`, `DELETE`, `/test` | `404/403` tanpa bocor data; resource B tidak berubah |

### 5.9 Penutupan L13

- Hapus semua endpoint uji; `GET /api/webhooks/{sessionId}` harus kosong.
- Tidak ada API key/aturan/media uji tertinggal.
- Catat status setiap ID: PASS / GAGAL / BLOCKED-PEMILIK / N/A.
- Kalau ada GAGAL: **berhenti dan laporkan**, jangan perbaiki dulu.

---

## 6. Prosedur bab berikutnya (ringkas, detail menyusul)

### L17 — Users, Settings, Notifications (44)

Kelompok: admin user management (01–08), branding/timezone (09–12), notifikasi
(13–20), system monitor (21–28), audit (29–30), popup What's New (31–44).
Prasyarat tambahan: **akun SUPERADMIN**. Tanpa itu, 01–08, 14, 26–28, 40 terblokir.

### L18 — Ketahanan (26)

Kelompok: restart worker/app (01–08), DB disconnect (09–10), storage error (11),
backup/restore (12–14), queue backlog (15), quota/idempotency concurrency (16–17),
webhook down/up (18), WA reconnect (19), isolasi regresi (20), secret/log scan (21–23),
mobile/responsive (24–25), long session (26).
**Sebagian besar butuh pemilik** (restart, backup/restore, DB). Tes 20–26 bisa
dijalankan sendiri.

### L15 — Integrasi (24)

Google Forms (G01–G12) dan Contact Form 7 (C01–C12). **Butuh keputusan pemilik:**
apakah keduanya benar-benar dipasarkan? Kalau tidak, tandai N/A seluruhnya, bukan
diam-diam dilewati. Kalau ya, perlu site WordPress/CF7 uji dan script Google Forms uji.

### Backfill L0–L3

- **L2 (P0):** 16 ID yang belum dirinci — admin page denial, sidebar, dan seluruh
  resource cross-tenant (webhook, integration token, API key, schedule, autoreply,
  campaign/segment N/A).
- **L1:** 37 tes baru (umur sesi, OTP, harga/trial) + 26 tes awal yang belum per ID.
- **L0:** 13 tes sanity yang belum punya bukti.
- **L3:** lifecycle sesi yang belum dirinci (create/QR/pairing/delete/2 sesi).

---

## 7. Yang dibutuhkan dari pemilik — dan cara memberikannya

Prinsip: **beri akses sesempit mungkin, hanya untuk akun/objek uji.** Jangan pernah
mengirim password akun pribadi/pemilik. Semua akses di bawah bisa dicabut setelah QA.

### 7.1 Akun SUPERADMIN untuk pengujian

**Yang saya butuhkan:** satu akun khusus QA ber-role SUPERADMIN.

**Cara paling aman (disarankan):**

1. Login sebagai superadmin Anda → menu **Users**.
2. Buat user baru, misalnya `qa-admin@kingofcoding.my.id`, role **SUPERADMIN**.
   Jangan pakai akun pribadi Anda.
3. Kirim ke saya: email + password akun QA itu (boleh lewat chat; akun ini khusus uji).
4. Setelah QA selesai, **turunkan role** akun itu menjadi USER atau hapus.

**Alternatif tanpa mengirim password:** login-kan akun QA itu di profil Brave
"Workbuddy only", lalu beri tahu saya. Saya memakai sesi browser, bukan password.
Konsekuensinya: sesi tenant yang sedang login akan tergantikan.

**Dipakai untuk:** L16-11…23, L17-01…08, L14-30, L1-23…26.

### 7.2 Akun tenant A dan tenant B

**Yang saya butuhkan:** cara masuk sebagai `testingusera@gmail.com` dan
`testinguserb@gmail.com` saat tes membutuhkannya.

**Pilihan:**

- **A (disarankan):** kirim password kedua akun uji itu saja. Keduanya akun QA,
  bukan akun pelanggan.
- **B:** Anda login-kan salah satu di profil Brave, lalu beri tahu saya tenant mana
  yang aktif. Saya tidak logout; saya hanya memakai sesi yang ada.

**Jangan kirim password akun pemilik/pelanggan sungguhan.**

### 7.3 Penerima webhook untuk L13

**Yang saya butuhkan:** satu URL penerima yang bisa saya baca isinya.

**Pilihan:**

- **A (paling cepat):** izinkan saya memakai `https://webhook.site` (payload uji saja)
  dan `https://httpbin.org` untuk kasus 500/timeout. Saya membuat token sendiri,
  memakainya, lalu menghapusnya.
- **B:** Anda buat request bin (webhook.site / Pipedream / layanan lain) dan kirim
  URL-nya. Saya tidak perlu akunnya.
- **C:** URL penerima milik Anda sendiri. Kalau mau, saya siapkan file PHP kecil
  untuk mencatat request, tapi ini menambah endpoint di server — perlu keputusan Anda.

**Data yang dikirim:** hanya metadata pesan uji (nomor uji, ID pesan, status). Tidak
ada pesan pelanggan.

### 7.4 Restart worker/aplikasi (L13-31, L18)

**Tidak perlu memberi akses.** Saya beri perintah persis + waktu yang saya butuhkan;
Anda yang menjalankan. Setelah restart, saya tunggu ±5 menit dan verifikasi status
sebelum melanjutkan.

### 7.5 Perubahan data uji di database (L14-14, L16-07, L1-55)

**Tidak perlu memberi akses DB.** Saya kirim SQL yang persis, hanya menyentuh akun uji:

- L14-14: mengosongkan satu slot API key uji **atau** mengisi `expiresAt` lampau pada
  key `qa-*`.
- L16-07 / L1-55: menggeser `trialEndsAt`/`endsAt` tenant uji ke masa lalu.

Anda menjalankan, lalu menempel hasil `SELECT`-nya. Saya tidak pernah memegang
kredensial database.

### 7.6 WordPress/Contact Form 7 dan Google Forms (L15)

**Yang saya butuhkan:**

- **CF7:** URL situs WordPress uji + akun admin (atau application password), dan
  plugin `pesanpro-contact-form-7` terpasang. Tanpa ini, 12 tes CF7 **BLOCKED**.
- **Google Forms:** akun Google uji + form uji, atau Anda deploy Apps Script
  `integrations/google-forms` dan kirim URL Web App-nya. Tanpa ini, tes "submit form"
  tidak bisa dijalankan; yang bisa hanya menguji endpoint connector secara langsung.

### 7.7 Aksi di HP untuk event webhook (L13-10…16)

**Tidak perlu akses.** Saya akan meminta Anda melakukan satu aksi spesifik pada
waktu yang saya tentukan: edit pesan, hapus untuk semua, posting status, ubah nama
kontak, atau ubah anggota grup. Satu aksi per permintaan, tidak beruntun.

### 7.8 Ringkasan akses minimum

| Akses | Sifat | Untuk |
| --- | --- | --- |
| Akun QA SUPERADMIN | Wajib | L16 admin, L17 admin, L14-30, L1-23…26 |
| Password 2 akun tenant uji | Wajib (atau login-kan browser) | L2/L3/L13/L17 |
| Izin webhook.site + httpbin, atau URL penerima | Wajib | L13 |
| Situs WordPress + plugin CF7 | Wajib untuk L15-C | L15 |
| Akun/form Google uji | Wajib untuk L15-G | L15 |
| Jendela restart | Koordinasi, bukan akses | L13-31, L18 |
| SQL uji | Anda jalankan, saya tidak pegang DB | L14-14, L16-07, L1-55 |

---

## 7A. Keputusan pemilik yang sudah final (24 Oktober 2026)

1. **L15 masuk lingkup uji sekarang:** Google Forms + Contact Form 7 (24 tes).
   Integrasi lain menyusul di fase produk berikutnya, belum masuk QA ini.
2. **L16-15 sesuai desain:** setelah SUPERADMIN menyetujui pembayaran, pengguna
   otomatis menerima email dan paket langsung aktif. Perilaku kode saat ini sudah
   benar; yang tersisa hanya pembuktian live setelah akses admin tersedia.

---

## 8. Format laporan per tes

```
L13-xx — PASS / GAGAL / BLOCKED-PEMILIK / N/A
Prasyarat:
Langkah:
Hasil (status + response penting):
Sumber kedua:
Bersih-bersih:
Catatan:
```

Untuk GAGAL, tambahkan: dampak ke pengguna, dugaan penyebab (kalau ada bukti),
dan **belum ada perbaikan** sampai pemilik memutuskan.

---

## 9. Definisi bab selesai

- Semua ID berstatus jelas: PASS / GAGAL / BLOCKED-PEMILIK / N/A beralasan.
- Tidak ada artefak uji tertinggal.
- Bukti dua sumber untuk setiap PASS.
- Temuan dicatat di `docs/qa/GITHUB-ISSUES-<tanggal>.md`.
- Roadmap dan memori diperbarui.
