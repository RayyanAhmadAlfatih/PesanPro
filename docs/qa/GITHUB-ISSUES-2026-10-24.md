# Temuan & Aksi — 24 Oktober 2026

## Akses QA terverifikasi

| Akses | Hasil |
| --- | --- |
| Superadmin `pesanpro@kingofcoding.my.id` | Role `SUPERADMIN`; `/api/users`, `/api/admin/plans`, `/api/admin/payment-verifications` → `200` |
| Tenant A `testingusera@gmail.com` | Login `302`, role `USER`, sesi `27092015` `CONNECTED` |
| Tenant B `testinguserb@gmail.com` | Login `302`, role `USER`, sesi `qa-b-session` `CONNECTED` |
| WordPress `pesanpro-test.kingofcoding.my.id` | `200`; Contact Form 7 6.2.3 + PesanPro CF7 1.0.0 aktif |
| Webhook receiver | webhook.site + httpbin disetujui pemilik |

Tidak ada kredensial yang disimpan di repo atau di disk; cookie uji sudah dihapus.

---

## L1-55 — PASS: perilaku setelah trial berakhir

**Waktu uji:** 24 Oktober 2026, 09:13 WIB (trial Tenant A berakhir 09:07 WIB).

| Pemeriksaan | Hasil |
| --- | --- |
| Login email + password | `302` ke dashboard — **masih bisa masuk** |
| `/api/auth/session` | Sesi valid, `accountActive: true` |
| `/dashboard` | `200` — dashboard terbuka |
| `/api/billing/summary` | `status: "EXPIRED"`, `trialEndsAt` & `endsAt` sudah lewat, `graceEndsAt: null` |
| Operasi komersial: `POST /api/webhooks/27092015` | `403 {"error":"Subscription is expired","code":"ENTITLEMENT_DENIED"}` |
| Operasi baca: `GET /api/webhooks/27092015` | `200` |

**Kesimpulan:** sesuai harapan roadmap — pengguna masih bisa login dan melihat data,
tetapi fitur komersial ditolak dengan pesan yang jelas. Tidak ada data yang hilang.

---

## Perpanjangan masa aktif tenant uji (superadmin)

Dilakukan lewat `PATCH /api/admin/subscriptions/{userId}` dengan alasan
`QA window extension 7 days (L13)`.

| Tenant | Plan | Status | `endsAt` baru |
| --- | --- | --- | --- |
| Tenant A | `plan_trial` | `TRIAL` | 31 Okt 2026, 09:14 WIB |
| Tenant B | `plan_starter` | `ACTIVE` | 31 Okt 2026, 09:14 WIB |

Diverifikasi lewat `/api/billing/summary` masing-masing tenant setelah perubahan.
Catatan: endpoint ini menaikkan `sessionVersion`, jadi sesi lama perlu login ulang.

---

## Instalasi plugin WordPress

- Contact Form 7 6.2.3 dipasang dari repository resmi.
- `pesanpro-contact-form-7` 1.0.0 diunggah dari repo lokal dan diaktifkan.
- Halaman setting `/wp-admin/options-general.php?page=pesanpro-cf7` → `200`.
- Base URL, integration token, dan recipient mapping **belum diisi** — akan
  dikonfigurasi saat L15.
- Catatan DNS: domain sempat `NXDOMAIN` di resolver mesin QA; setelah diperbaiki,
  akses normal `200`.

---

## [P1] Pesan gagal terkirim: `SESSION_NOT_READY` padahal sesi `CONNECTED`

**Ditemukan:** 24 Oktober 2026, 09:30–09:33 WIB, saat L13-25/26.
**Dampak:** pesan pelanggan tidak terkirim. API menerima job (`202`), lalu job
`FAILED` setelah 5 percobaan. Event `message.sent` tidak pernah keluar, sehingga
webhook pelanggan juga tidak menerima apa pun.

**Reproduksi:**
1. Sesi `qa-b-session` di dashboard berstatus `CONNECTED`.
2. `POST /api/v1/messages/text` ke `6283877315731` dengan `sessionId=qa-b-session`.
3. Respons `202`, job dibuat.
4. Dalam ±35 detik job menjadi `FAILED`, `attempts=5`,
   `error.code=SESSION_NOT_READY`, `error.message="WhatsApp device is not ready"`,
   `sentAt=null`, `deliveredAt=null`.

**Bukti:**
- Job `cmvls81bp0ooq3dzil9dulk3k` → `FAILED` (5 attempt).
- Job `cmvlsabo30or33dzias0u7jht` → `FAILED` (5 attempt).
- `GET /api/sessions/qa-b-session` → `status: "CONNECTED"`, `updatedAt`
  `2026-10-23T20:03:26Z`.
- `/api/health/live` → `uptimeSeconds` ±51.400 (proses tidak restart setelah sesi
  dihidupkan).
- Jalur kode: `dispatchQueuedMessage` menolak jika
  `waManager.getInstance(sessionId)` tidak ada, `socket` null, atau
  `instance.status !== "CONNECTED"`.
- Tidak ada delivery webhook `message.sent`; yang ada hanya event `test`.

**Dugaan penyebab (belum dikonfirmasi):** status di database dan instance di memori
berbeda. Manager bisa kehilangan instance tanpa status DB ikut berubah — misalnya
saat `stopAfterLeaseFailure` menghapus instance lalu update DB gagal (ditulis dengan
`.catch(() => undefined)`), atau saat `loadSessions` melewati sesi karena lease masih
dipegang worker lain. Untuk memastikan perlu log pm2.

**Status:** **OPEN — menunggu pemilik.** Belum ada perubahan kode.

**Dampak ke L13:** L13-25 tidak valid (pesannya tidak pernah terkirim, jadi
"tidak ada event" tidak membuktikan disable bekerja). L13-26 terblokir. Tes L13
yang membutuhkan pengiriman (07–19) ditahan sampai masalah ini selesai.

---

## [P1] Update — root cause terkonfirmasi dari log pm2

**Bukti utama (waktu WIB):**

```
05:01:58  EmailWorker/Heartbeat/Manager/... : Can't reach database server at localhost:3306
05:01:58  Manager: Failed to renew runtime lease for session qa-b-session
05:01:58  Manager: Failed to renew runtime lease for session 27092015
...
10:30:57  MessageWorker: Job cmvls81... will retry: SESSION_NOT_READY
10:31:30  MessageWorker: Job cmvls81... failed: SESSION_NOT_READY
```

Sebelumnya sesi juga berulang kali putus dan reconnect:

```
02:10:23  Session qa-b-session disconnected. Reconnecting (1/3)...
03:14:50  Session qa-b-session disconnected. Reconnecting (1/3)...
04:03:16  Session qa-b-session disconnected. Reconnecting (1/3)...
05:01:58  Session qa-b-session disconnected. Reconnecting (1/3)...
```

**Urutan kejadian:**

1. Database MySQL di `localhost:3306` mati sesaat (05:01:58, dan lagi 09:16:53).
2. Lease runtime sesi gagal diperpanjang karena DB tidak bisa dihubungi.
3. `stopAfterLeaseFailure` menjalankan `shutdown()` dan menghapus instance dari
   `waManager` — ini benar agar tidak terjadi dua pengirim.
4. Status database ingin diubah ke `FAILED`, tetapi **DB sedang mati**, dan update
   itu ditulis dengan `.catch(() => undefined)` sehingga kegagalannya ditelan.
5. DB pulih, tetapi status tetap `CONNECTED` dan instance tidak pernah dibuat ulang.
   `loadSessions` hanya berjalan saat aplikasi start; tidak ada rekonsiliasi berkala.
6. Akibatnya API/dashboard bilang `CONNECTED`, tetapi setiap pengiriman gagal
   `SESSION_NOT_READY` sampai aplikasi di-restart.

**Kesimpulan:** ini bug ketahanan (resilience), bukan salah konfigurasi sesi.
DB yang sempat mati adalah pemicu; yang membuatnya permanen adalah tidak adanya
rekonsiliasi antara status DB dan instance di memori.

**Perbaikan yang diusulkan (belum dikerjakan, menunggu persetujuan):**

1. `stopAfterLeaseFailure`: jangan telan kegagalan update status. Coba ulang
   beberapa kali; kalau tetap gagal, simpan penanda di memori dan ulangi saat DB
   sudah bisa dihubungi.
2. Tambah rekonsiliasi berkala (mis. tiap 60 detik): sesi `CONNECTED` di DB yang
   tidak punya instance dan tidak dipegang worker lain → init ulang; kalau gagal →
   `FAILED` + notifikasi ke pemilik.
3. `dispatchQueuedMessage`: kalau instance hilang tetapi DB bilang `CONNECTED`,
   coba rehidrasi sekali (dengan lease) sebelum menyerah, agar satu job tidak
   langsung gagal 5 kali.

**Pemulihan sementara:** restart `pesanpro` agar `loadSessions` membuat ulang
instance. Namun bug akan terulang pada gangguan DB berikutnya kalau kode belum
diperbaiki.

**Catatan infrastruktur:** MySQL mati dua kali dalam 4 jam. Perlu dicek penyebabnya
(OOM, disk, restart service) — di luar akses QA.

---

## [P2] Satu pesan menghasilkan dua event `message.sent` dengan payload berbeda

**Ditemukan:** 24 Oktober 2026, 10:12 WIB, saat L13-26 (setelah webhook diaktifkan).
**Dampak:** pelanggan menerima notifikasi ganda untuk satu pesan. Integrasi yang
memproses `message.sent` bisa mengirim balasan/CRM update dua kali.

**Bukti:** satu pesan (`jobId cmvltoz1t01jey7f5ybl2b63b`, WA message ID
`PP674206DF2A6EDD7812902BB89093E6`) menghasilkan dua event dalam detik yang sama:

| Event ID | Payload |
| --- | --- |
| `wh_evt_6cdcea01-a209-4ce7-98e3-dd95cf636abf` | `{jobId, messageId, recipient, status:"SENT"}` |
| `wh_evt_88f736b9-8f9f-4b09-a899-c93e47648798` | `{key:{id,remoteJid,fromMe}, from, receiver, sender:"ME", type, content, quoted, timestamp}` |

**Jalur kode:**
- `src/lib/message-queue.ts:118` — outbox event `message.sent` dengan eventKey
  `message-job:{jobId}:SENT` (payload ringkas).
- `src/modules/whatsapp/message-adapter.ts:79` — `onMessageSent()` →
  `publishWebhookEvent()` (payload lama yang lebih lengkap).
- `src/modules/whatsapp/store/index.ts:539` juga memanggil `onMessageSent()` pada
  `messages.upsert`; pada pengiriman lewat antrean, jalur ini bisa menambah event
  ketiga bila Baileys memancarkan upsert.

**Status:** **OPEN — menunggu keputusan pemilik.** Belum ada perubahan kode.

**Pilihan perbaikan:**
1. Hentikan pemanggilan `onMessageSent` dari `message-adapter.ts` untuk pengiriman
   lewat antrean (satu event, payload ringkas + jobId).
2. Pertahankan payload lengkap dan hapus event dari `message-queue.ts`.
3. Pakai eventKey yang sama (mis. `message.sent:{whatsappMessageId}`) agar outbox
   men-dedupe, lalu tentukan satu bentuk payload kanonik.

Pilihan 3 paling aman untuk kompatibilitas, tetapi butuh keputusan bentuk payload
mana yang final.

---

## L13-25/26 setelah restart — PASS (dengan satu temuan P2)

| ID | Hasil | Bukti |
| --- | --- | --- |
| L13-25 | **PASS** | Webhook dinonaktifkan → pesan `cmvltm9qs01fvy7f51j65ja4z` `READ` (1 attempt); receiver tidak menerima event baru (tetap 2) |
| L13-26 | **PASS** | Webhook diaktifkan → pesan `cmvltoz1t01jey7f5ybl2b63b` `READ`; receiver menerima `message.sent` |

Saat L13-26, receiver menerima **dua** event untuk pesan yang sama — dicatat sebagai
P2 di atas.

---

## Perbaikan P1 — rekonsiliasi sesi (DIPERBAIKI, menunggu deploy)

**File diubah:**
- `src/modules/whatsapp/manager.ts` — rekonsiliasi tiap 60 detik untuk sesi
  `CONNECTED` yang tidak punya instance; `persistSessionStatus` mencoba ulang update
  status 3× dengan jeda, tidak lagi menelan kegagalan.
- `src/modules/whatsapp/message-adapter.ts` — sebelum job gagal, coba rehidrasi sesi
  sekali (cooldown 30 detik) agar job pertama setelah DB pulih tidak langsung gagal.
- `src/modules/whatsapp/manager-reconcile.test.ts` (baru) — 3 tes: sesi tanpa
  instance dibuat ulang, sesi tanpa kredensial dilewati, lease milik worker lain
  tidak diperebutkan.

**Yang tidak berubah:** lease tetap mencegah dua worker mengirim untuk sesi yang sama;
tidak ada perubahan skema atau API.

**Verifikasi:** 3/3 tes baru lolos; total suite 385 tes lolos; `tsc` 0 error;
`eslint` bersih. **Belum terbukti live** sampai deploy.

---

## Perbaikan P2 — satu event `message.sent` (opsi 3, DIPERBAIKI, menunggu deploy)

**File diubah:**
- `src/lib/message-queue.ts` — berhenti membuat event `message.sent` sendiri.
- `src/lib/webhook.ts` — `onMessageSent` menerima `{ jobId }`, menambahkan `jobId`
  ke payload, dan memakai WhatsApp message ID sebagai eventKey eksplisit;
  `dispatchWebhook` meneruskan eventKey ke outbox.
- `src/modules/whatsapp/message-adapter.ts` — menunggu (`await`) penyimpanan event
  sebelum job selesai, dengan `jobId`.
- `src/lib/webhook-dispatch.test.ts` (baru) — 2 tes: eventKey diteruskan, pemanggil
  lama tanpa key tetap kompatibel.

**Hasil yang diharapkan:** satu pesan = satu event `message.sent`, payload lengkap
(`key/from/receiver/type/content/quoted`) + `jobId`. Jalur store yang juga memanggil
`onMessageSent` memakai message ID yang sama sehingga otomatis ter-dedupe.

**Verifikasi:** 2/2 tes baru lolos; total suite 385 tes lolos; `tsc` 0 error;
`eslint` bersih. **Perlu uji live setelah deploy:** kirim satu pesan, pastikan
receiver hanya menerima satu event.

---

## [P2] `message.status` ganda dan tidak konsisten (L13-09 GAGAL)

**Ditemukan:** 24 Oktober 2026, 16:55 WIB, setelah deploy P2 `message.sent`.
**Dampak:** satu pesan menghasilkan **6 event** `message.status` (3 DELIVERED,
2 READ, plus duplikat), dengan dua bentuk payload berbeda. Integrasi bisa
menghitung status berkali-kali atau memproses format yang tidak dikenal.

**Bukti:** pesan `PP2BBEB2AA2BA910C9C25A8D83545A62`, job
`cmvm83fig032it86mj5sb2iui`. Enam event dalam 2 detik:

| Bentuk payload | Jumlah | Contoh |
| --- | --- | --- |
| `{keyId, remoteJid, status}` | 4 | `{"keyId":"PP2BB...","remoteJid":"154077874929843@lid","status":"DELIVERED"}` |
| `{jobId, messageId, recipient, status, payload}` | 2 | `{"jobId":"cmvm83...","messageId":"PP2BB...","status":"READ","payload":{...}}` |

RemoteJid juga berbeda-beda (`@lid`, `:37@lid`), sehingga dedupe berdasarkan
status saja belum cukup.

**Jalur kode:**
- `src/modules/whatsapp/store/index.ts` — `messages.update` memanggil
  `dispatchWebhook("message.status", { keyId, remoteJid, status })`. Baileys
  memancarkan beberapa update untuk satu status, jadi muncul beberapa event.
- `src/lib/message-queue.ts` — saat job mencapai SENT/DELIVERED/READ, membuat
  outbox event `message.status` dengan payload `{jobId, messageId, recipient,
  status, payload}` dan eventKey berbeda.

**Status:** **OPEN — menunggu keputusan pemilik.** Belum ada perubahan kode.

**Pilihan perbaikan:**
1. **Satu event per (messageId, status)** dengan payload gabungan
   `{jobId, messageId, recipient, remoteJid, status}`, eventKey
   `message.status:{messageId}:{status}`. Jalur antrean menjadi kanonik; jalur
   store hanya untuk pesan yang tidak lewat antrean.
2. **Payload store kanonik** `{keyId, remoteJid, status}` — paling sederhana,
   tetapi kehilangan `jobId` dan `recipient`.
3. **Gabungan dengan lookup jobId** — store mencari job berdasarkan messageId;
   payload paling lengkap, tetapi menambah satu query per status.

Rekomendasi: **opsi 1**, konsisten dengan perbaikan `message.sent`.

---

## Perbaikan P2 `message.status` — opsi 1 (DIPERBAIKI, menunggu deploy)

**Keputusan pemilik:** satu event per `(messageId, status)`; payload gabungan
`{jobId, messageId, recipient, remoteJid, status}`; jalur antrean kanonik.

**File diubah:**
- `src/lib/message-queue.ts` — eventKey menjadi
  `message.status:{whatsappMessageId}:{type}`; payload menambahkan `remoteJid`.
- `src/modules/whatsapp/store/index.ts` — payload store menambahkan `messageId`
  dan `recipient`, memakai eventKey yang sama sehingga salinan store ter-dedupe
  oleh unique constraint outbox. Pesan yang dikirim di luar antrean tetap
  mendapat event dari jalur store.
- `src/lib/webhook-event-key.test.ts` (baru) — 2 tes: payload store dan antrean
  untuk status yang sama menghasilkan key identik; status berbeda tetap terpisah.

**Mengapa ini bekerja:** store memanggil `recordMessageDeliveryStatus()` lebih dulu
(menunggu transaksi antrean), baru kemudian `dispatchWebhook()`. Jadi event antrean
dengan payload lengkap sudah tersimpan sebelum salinan store dicoba; salinan store
mendapat `P2002` dan memakai baris yang sudah ada.

**Verifikasi:** 2/2 tes baru lolos; `tsc` 0 error; `eslint` bersih. **Perlu uji live
setelah deploy:** satu pesan harus menghasilkan satu DELIVERED dan satu READ,
tanpa duplikat.

---

## [P1] Situs 502 setelah deploy status fix (24 Oktober 2026, 18:58 WIB)

**Gejala:** `https://wagateway.kingofcoding.my.id/` dan `/api/health/live` → `502`
dari nginx. PM2 melaporkan `pesanpro` online (↺12), tetapi aplikasi tidak melayani
port 3000.

**Dugaan:** build yang dijalankan sebelum restart tidak selesai (output tidak
menampilkan "Compiled successfully"), sementara `.next` lama sudah dipindahkan.
Aplikasi lalu gagal start karena tidak ada build valid.

**Pemulihan:** kembalikan `.next.bak-*` terakhir (build `ac92267` yang terbukti
sehat), lalu restart. Perbaikan status (`6f8e1a7`) dibangun ulang setelah situs
pulih.

**Status:** **OPEN — menunggu pemilik menjalankan pemulihan.**

---

## Situs pulih — 24 Oktober 2026, 19:28 WIB

- `.next` dipulihkan dari `.next.bak-1792841723` (build `ac92267`).
- `BUILD_ID` terisi, PM2 online, `/api/health/ready` → `ok`, sesi `qa-b-session`
  dan `27092015` `CONNECTED`.
- Endpoint webhook uji masih aktif (`qa-l13-04`, events `message.sent` +
  `message.status`).
- Perbaikan status `6f8e1a7` **belum terpasang**; build ulang harus diawasi sampai
  `Compiled successfully` sebelum restart.

**Pelajaran deploy:** jangan pindahkan `.next` sebelum build terbukti selesai.
Prosedur aman: `cp -a .next .next.prev` → build dengan log → cek
`Compiled successfully` → baru restart; kalau gagal, pulihkan `.next.prev`.

---

## [P2] Gagal menyimpan baris pesan: `Message_messageJobId_key`

**Ditemukan:** log pm2, 24 Oktober 2026 pukul 11:10, 11:12, 17:54, 17:55 WIB.
**Dampak:** pesan terkirim (job `READ`), tetapi baris `Message` gagal dibuat karena
`messageJobId` sudah dipakai. Riwayat/antrean bisa kehilangan baris pesan.

**Bukti:**
```
Error saving message: Unique constraint failed on the constraint: `Message_messageJobId_key`
```

**Dugaan:** dua jalur menyimpan pesan untuk job yang sama (store `messages.upsert`
dan jalur antrean), dan yang kedua memakai `create` alih-alih upsert/idempotent.
Belum diperbaiki.

---

## Bukti watchdog Fase 0 #1 bekerja

Log 24 Oktober 16:09:22–16:09:23:

```
Session 27092015 connection unhealthy (socket is not open, last inbound 8 min ago). Reconnecting.
Session qa-b-session connection unhealthy (socket is not open, last inbound 8 min ago). Reconnecting.
```

Kedua sesi terdeteksi tidak sehat dan disambung ulang otomatis — perilaku yang
diharapkan dari watchdog 60 detik. Ini bukti live pertama untuk perbaikan #1.

---

## Deploy perbaikan `message.status` — 24 Oktober 2026, 20:05 WIB

- Build `6f8e1a7` sukses: `✓ Compiled successfully in 4.2min`, `EXIT:0`.
- PM2 restart (↺17 lalu ↺18; restart kedua tidak berbahaya, build sama).
- `/api/health/ready` → `ok`; sesi `qa-b-session` `CONNECTED`.
- Menunggu jeda 5 menit sebelum uji kirim. Hasil L13-09 akan dicatat setelahnya.

---

## L13 — hasil setelah perbaikan status (24 Oktober 2026, 20:10 WIB)

| ID | Hasil | Bukti |
| --- | --- | --- |
| L13-09 | **PASS** | Satu pesan `PP8F1CA5...` → tepat 1 `message.sent`, 1 `message.status DELIVERED`, 1 `message.status READ`; job `cmvmf15mx...` `READ` |
| L13-20 | **PASS** | Endpoint `httpbin/status/500`, `maxAttempts=2` → delivery `DEAD_LETTER`, 2 attempt `FAILED HTTP_500` |
| L13-21 | **PASS** | `httpbin/delay/15`, `timeoutMs=1000` → 2 attempt `FAILED TIMEOUT`, `DEAD_LETTER` |
| L13-23 | **PASS** | Replay delivery gagal → delivery baru `cmvmf33hj...` (`replayOfId` benar); original tetap `DEAD_LETTER` 2 attempt |
| L13-24 | **PASS** | Replay delivery sukses → delivery baru `cmvmf34jb...`; original tetap `SUCCEEDED` 1 attempt |
| L13-30 | **PASS** | `DELETE` → 200 `deleted:true`; daftar tidak memuat endpoint; `/test` → 404 `WEBHOOK_NOT_FOUND` |
| L13-32 | **PASS** | Tenant A: `GET`/`PUT`/`POST test` ke endpoint Tenant B → 404 `SESSION_FORBIDDEN`; endpoint B tidak berubah |

**Status L13:** 20 PASS, 1 N/A (19 — Campaign dipensiunkan), 11 belum:
07, 10–18, 31. Sebagian besar butuh aksi HP atau restart worker.

Endpoint uji `qa-l13-04` sudah dihapus. Tersisa endpoint lama
`QA-L2-17-Tenant-Isolation` (inactive, 5.532 delivery) dari QA sebelumnya —
bukan milik sesi ini, tidak dihapus.

---

## L13 sisa — hasil bertahap (24 Oktober 2026, 21:03 WIB)

| ID | Hasil | Bukti |
| --- | --- | --- |
| L13-07 | **PASS** | `message.received` diterima 21:02:55 WIB, isi `uji-l13-07-masuk-20261024`, satu event |

---

## [P2] `connection.update` tidak pernah dikirim (L13-10 GAGAL)

**Ditemukan:** 24 Oktober 2026, 21:05 WIB. Pemilik melakukan Stop → Start pada
`qa-b-session`; sesi kembali `CONNECTED` (updated 21:05:27), tetapi receiver tidak
menerima satu pun event `connection.update`.

**Root cause (terkonfirmasi dari kode):**
- `src/lib/webhook.ts:253` mendefinisikan `onConnectionUpdate()`, tetapi fungsi itu
  **tidak dipanggil di mana pun** (`grep` hanya menemukan definisinya).
- `src/modules/whatsapp/instance.ts` hanya mengirim `connection.update` ke Socket.IO
  untuk UI, tidak ke webhook.
- Akibatnya event terdaftar di kontrak dan bisa dipilih pelanggan, tetapi tidak pernah
  keluar.

**Dampak:** pelanggan yang berlangganan `connection.update` tidak pernah diberi tahu
saat perangkat putus, logout, atau tersambung kembali.

**Status:** **OPEN — menunggu keputusan pemilik.** Belum ada perubahan kode.

**Usulan fix (kecil):** panggil `onConnectionUpdate(sessionId, status, qr)` di handler
`connection.update` pada `instance.ts`, hanya ketika status berubah (bukan setiap QR
diperbarui). Tambah tes regresi untuk memastikan satu event per transisi status.

---

## Perbaikan `connection.update` (DIPERBAIKI, menunggu deploy)

**File diubah:**
- `src/modules/whatsapp/instance.ts` — semua transisi status melewati
  `emitConnectionUpdate()`: emit ke Socket.IO + panggil `onConnectionUpdate()`.
  Event webhook hanya dikirim saat status berubah; refresh QR berulang tidak
  menghasilkan event ganda.
- `src/lib/webhook-dispatch.test.ts` — tes payload `connection.update`.

**Verifikasi:** `tsc` 0 error, `eslint` bersih. Tes unit lokal tidak bisa dijalankan
karena aturan keamanan lingkungan memblokir pembacaan dependensi Baileys; verifikasi
utama dilakukan live setelah deploy (satu event per transisi).

**Commit:** `ef78b8b`, sudah di origin.

---

## L13-10 — PASS (setelah deploy `ef78b8b`)

- Event `connection.update` terbentuk dengan payload
  `{"status":"CONNECTED","qr":null}`.
- Delivery `cmvn5k16k...` ke `https://httpbin.org/post` → **SUCCEEDED 200**,
  attempt 1.
- Delivery lama ke webhook.site gagal `HTTP_429` (rate limit receiver), bukan
  kegagalan aplikasi; karena itu verifikasi 200 dilakukan lewat httpbin.

**Catatan gap (P3):** transisi `STOPPED` dari tombol Stop di dashboard belum
dipublikasikan — `manager.stopSession()` mengirim Socket.IO langsung tanpa melewati
helper webhook. Transisi `CONNECTED` sudah benar. Dicatat untuk perbaikan berikutnya,
tidak menghalangi L13-10.

**Receiver baru:** webhook.site token `b35f4bab-...`; subscription dikurangi ke
event yang tersisa (connection/group/contact/status/edited/deleted/schedule/broadcast)
agar tidak terkena rate limit dari event `status@broadcast`.

---

## `contact.update` dipensiunkan (keputusan pemilik, 25 Oktober 2026)

**Alasan:** Chat inbox sudah pensiun, sehingga tidak ada layar yang memakai nama
kontak. Event ini hanya tersisa sebagai janji di dashboard Webhooks.

**Perubahan:**
- `src/lib/webhook-contract.ts` — `contact.update` dihapus dari daftar event.
- `src/app/dashboard/webhooks/page.tsx` — pilihan "Contact Update" dihapus.
- `src/modules/whatsapp/store/index.ts` — dispatch `contact.update` dihentikan;
  sinkronisasi kontak ke database tetap berjalan.
- `src/lib/webhook-contract.test.ts` — tes memastikan event pensiun tidak muncul lagi.

**Dampak:** endpoint lama yang masih berlangganan `contact.update` tidak akan menerima
event lagi (subscription-nya menjadi inert). Tidak ada perubahan data pelanggan.

**Verifikasi:** `tsc` 0 error, `eslint` bersih, 6/6 tes kontrak lolos.
**Status:** kode selesai, menunggu deploy bersama perubahan berikutnya.

**L13-13:** N/A (dipensiunkan), bukan gagal.

---

## `status.update` dan `campaign.status` dipensiunkan (25 Oktober 2026)

**Alasan:** `status.update` tidak punya pengirim sama sekali (hanya dipajang di UI),
dan `campaign.status` milik fitur Campaign yang sudah pensiun.

**Perubahan:**
- `src/lib/webhook-contract.ts` — kedua event dihapus dari daftar.
- `src/app/dashboard/webhooks/page.tsx` — pilihan "Status/Story" dan
  "Campaign Status" dihapus.
- `src/lib/campaign-queue.ts` — dispatch `campaign.status` dan import outbox dihapus.
- `src/lib/webhook-contract.test.ts` — tes memastikan ketiga event pensiun
  (`contact.update`, `status.update`, `campaign.status`) tidak muncul lagi.

**Dampak:** endpoint lama yang berlangganan event ini menjadi inert. Tidak ada
perubahan data pelanggan.

**Verifikasi:** `tsc` 0 error, `eslint` bersih, 6/6 tes kontrak lolos.
**Status:** kode selesai, menunggu deploy bersama `contact.update` dan gap `STOPPED`.

**L13-14 dan L13-19:** N/A (dipensiunkan), bukan gagal.
