# Temuan & Aksi — 26 Oktober 2026

Sesi kerja: lanjutan L13 (webhook) dengan Tenant B (`qa-b-session`).
Semua uji live memakai nomor uji `6283877315731` dan kata kunci `uji*`.

---

## Ringkasan

| Item | Hasil |
| --- | --- |
| L13-17 `schedule.status` | **PASS** |
| L13-18 `broadcast.status` | **PASS** |
| L17-16/17/19 notifikasi | **PASS** |
| P2 — event palsu dari status WhatsApp | **Diperbaiki di kode**, menunggu deploy |
| P2 — sesi `FAILED` tanpa pemberitahuan & tanpa pemulihan | **Diperbaiki di kode**, menunggu deploy |
| Sisa L13 | 07, 11, 12, 15, 16, 31 — butuh aksi HP / deploy / restart |
| Sisa L17 | 01–15, 18, 20–44 — butuh SUPERADMIN (kecuali 18 yang butuh ≥2 notifikasi) |

---

## Kondisi awal sesi (fakta, bukan dugaan)

- `/api/sessions` menunjukkan `qa-b-session` berstatus **`FAILED`**, `updatedAt`
  26 Okt 12:44 WIB. Dashboard menampilkan "1 session perlu diperiksa".
- Tidak ada notifikasi apa pun di lonceng tenant (hanya notifikasi lama "test"
  dari 21 Sep).
- Tombol **Start** ditekan dari dashboard → sesi menjadi **`CONNECTED`** dalam
  hitungan detik **tanpa perlu scan QR**, artinya kredensial masih valid dan
  hanya instance runtime yang hilang.
- Receiver uji `webhook.site` mengembalikan **HTTP 429** untuk semua kiriman
  (connection.update dan schedule.status pertama). Endpoint uji
  `qa-l13-events` diarahkan ke `https://httpbin.org/post` (L13-27: perubahan URL
  efektif), setelah itu semua delivery `SUCCEEDED 200`.

---

## L13-17 — `schedule.status` — PASS

**Langkah:** buat jadwal sekali jalan lewat dashboard API
(`POST /api/scheduler/qa-b-session`) untuk 14:23:30 WIB, isi
`uji-schedule-L13-17 halo, ini pesan terjadwal dari QA.`

| Bukti | Hasil |
| --- | --- |
| Riwayat jadwal (`/api/scheduler/qa-b-session?tab=history`) | `status: COMPLETED`, `lastRunAt` 14:23:30 WIB |
| Delivery log webhook | `event: schedule.status`, `SUCCEEDED`, `responseStatusCode: 200` |
| Payload diterima | `{"scheduleId":"cmvoxfjjl0p8c88grzi0ekomm","executionId":"cmvoxjzai0pbd88grerizxbnp","status":"COMPLETED","errorCode":null}` |

Amplop sesuai kontrak: `id`, `event`, `apiVersion` `2026-09-04`, `createdAt`,
`sessionId`, `data`.

---

## L13-18 — `broadcast.status` — PASS

**Langkah:** buat broadcast 1 penerima (`uji-broadcast-L13-18 ...`) dengan
`delay: 5000`, lalu jalankan.

| Bukti | Hasil |
| --- | --- |
| Riwayat broadcast | `cmvoxodgx0pg888gr4y2793k6` → `COMPLETED` |
| Delivery log webhook | `event: broadcast.status`, `SUCCEEDED`, `200` |
| Payload diterima | `{"broadcastId":"cmvoxodgx0pg888gr4y2793k6","status":"COMPLETED"}` |

Catatan perilaku (bukan bug, P3): worker hanya mengirim `broadcast.status` saat
broadcast `COMPLETED` atau `FAILED`; tidak ada event `RUNNING`, jadi tenant tidak
bisa memantau progres lewat webhook. Roadmap hanya meminta payload benar, jadi
tes ini tetap PASS.

Catatan paket: tanpa `delay`, permintaan ditolak
`422 BROADCAST_DELAY_TOO_SHORT` ("minimal 5 detik") — sesuai kebijakan paket
Starter, bukan kesalahan.

---

## P2 — event `message.edited` / `message.deleted` palsu dari status WhatsApp

**Dampak:** webhook tenant dibanjiri event yang tidak ada hubungannya dengan
percakapan mereka. Dari 100 delivery terakhir pada endpoint uji, **41** adalah
event `status@broadcast`:

```
message.edited  {"keyId":"AC4272...","newContent":"","remoteJid":"status@broadcast"}
message.deleted {"keyId":"AC1216...","remoteJid":"status@broadcast"}
```

**Penyebab:** WhatsApp mengirim update status (dihapus/kedaluwarsa) pada stream
`messages.update` yang sama, dengan penanda `messageStubType` yang sama seperti
pesan biasa yang dihapus. Handler tidak memeriksa JID, jadi setiap status kontak
yang hilang dianggap "pesan dihapus" milik tenant.

**Perbaikan:** guard `isTenantChatJid()` baru (`src/lib/message-event-scope.ts`)
menolak `status@broadcast`, `@broadcast`, dan `@newsletter`; dipakai di handler
`messages.update` dan di awal pemrosesan pesan masuk. Pesan pribadi, grup, dan
`@lid` tidak terpengaruh.

---

## P2 — sesi `FAILED` tanpa pemberitahuan dan tanpa pemulihan

**Dampak:** sesi berhenti 26 Okt 12:44 WIB, tenant tidak diberi tahu, dan sesi
tetap mati sampai ada orang yang menekan Start. Semua pengiriman gagal
`SESSION_NOT_READY` selama itu.

**Penyebab:** status `FAILED` hanya ditulis oleh runtime (lease hilang, start
gagal). Tidak ada jalur yang mengirim notifikasi untuk status ini, dan
rekonsiliasi 60 detik hanya memeriksa baris `CONNECTED`, sehingga baris `FAILED`
tidak pernah dicoba lagi.

**Perbaikan:**

1. Rekonsiliasi sekarang juga mengambil sesi `FAILED` yang punya kredensial, dan
   mencoba menyalakannya kembali dengan jeda bertumbuh (1 → 5 → 15 → 60 menit,
   lalu berulang tiap jam). Tidak ada percobaan tanpa batas yang menembak
   WhatsApp terus-menerus.
2. Setelah tiga percobaan gagal, pemilik sesi menerima notifikasi
   (`kind: FAILED`) berisi tautan ke halaman Sesi. Notifikasi hanya dikirim
   sekali sampai sesi berhasil menyala lagi.
3. Sesi yang sengaja dihentikan (`STOPPED`) tetap tidak disentuh.

---

## L17-16 / 17 / 19 — notifikasi (USER) — PASS

| Tes | Bukti |
| --- | --- |
| L17-16 Inbox unread | Badge lonceng di header menampilkan **1**, `/api/notifications` memberi `unread=1` dari 1 baris |
| L17-17 Mark one read | `PATCH /api/notifications/read {ids:[…]}` → `200`; `unread` menjadi **0**; badge hilang setelah reload |
| L17-19 Delete notification | `DELETE /api/notifications/delete?id=…` → `200`; daftar menjadi `total=0`, badge tetap kosong |

L17-18 (mark all read) belum dijalankan: hanya ada satu notifikasi, jadi jalur
"semua" tidak bisa dibuktikan. Perlu dibuatkan ≥2 notifikasi oleh superadmin.

---

## Paket menunggu pemilik

### 1. Deploy build terbaru (satu kali, untuk empat commit)

Commit yang menunggu: `47bb120` + `6099d81` (edit/hapus pesan), `ebec9d3` +
`2b5ae8d` (pensiunkan `contact.update`, `status.update`, `campaign.status`),
`4402f8b` (buang event status), `3f3f74d` (pemulihan sesi FAILED).
Tidak ada migrasi database.

```bash
cd <direktori-app-di-VPS>
git fetch origin && git checkout workbuddy-fase0-qa-2026-10-23 && git pull --ff-only
mv .next .next.prev-$(date +%s)
node --max-old-space-size=3072 node_modules/next/dist/bin/next build --webpack
# tunggu sampai muncul "Compiled successfully" — jangan restart kalau belum
pm2 restart pesanpro
```

Durasi perkiraan: build 5–13 menit, restart + 502 sesaat ±30 detik.
Dampak: sesi WhatsApp tersambung ulang otomatis; pengiriman tertunda beberapa detik.

### 2. Akses SUPERADMIN

Dibutuhkan untuk L16-11..23 dan hampir seluruh L17 (01–15, 18, 20–44).
Cukup salah satu: kata sandi akun `pesanpro@kingofcoding.my.id`, atau login-kan
browser `Profile 11` ke akun itu.

### 3. Aksi HP (L13-07, 11, 12, 15, 16)

- Kirim satu pesan WhatsApp biasa ke nomor uji → L13-07 (`message.received`).
- Edit lalu hapus pesan itu dari HP → L13-15 dan L13-16 (butuh deploy nomor 1 dulu).
- Ubah nama grup dan tambah/hapus satu anggota → L13-11 dan L13-12.

### 4. Satu kali restart worker (L13-31)

Setelah deploy, restart `pesanpro` sekali lagi sambil memastikan antrean webhook
tidak hilang atau berganda.
