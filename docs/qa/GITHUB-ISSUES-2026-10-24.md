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
