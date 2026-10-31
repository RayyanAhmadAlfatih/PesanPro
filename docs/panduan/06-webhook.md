# 06 — Webhook

Webhook memungkinkan sistem Anda menerima event dari PesanPro secara real-time: pesan masuk, pesan terkirim, status pengiriman, perubahan koneksi, dan status broadcast/jadwal.

PesanPro mengirim **HTTP POST** ke URL yang Anda tentukan, dengan **signature HMAC** agar Anda bisa memastikan request benar-benar dari PesanPro.

## Membuat endpoint webhook

1. Buka dashboard → **Webhooks**.
2. Pilih perangkat.
3. Klik **Tambah endpoint**.
4. Isi:
   - **Nama** — untuk Anda sendiri.
   - **URL** — harus HTTPS di produksi.
   - **Event** — pilih event yang dibutuhkan, atau `*` untuk semua.
   - **Max attempts** — 1–12, default 8.
   - **Timeout** — 1.000–30.000 ms, default 10.000 ms.
5. Simpan.
6. **Salin secret sekarang.** Secret hanya ditampilkan sekali.

> URL webhook tidak boleh mengarah ke alamat internal/private. PesanPro memblokir `localhost`, `127.0.0.1`, rentang private IP, dan metadata cloud untuk mencegah SSRF.

## Event yang tersedia

| Event | Kapan dikirim |
| --- | --- |
| `message.received` | Ada pesan masuk |
| `message.sent` | Pesan keluar berhasil dikirim |
| `message.status` | Status pesan berubah (`SENT`, `DELIVERED`, `READ`, `FAILED`) |
| `connection.update` | Status perangkat berubah (connected, disconnected, QR, dll.) |
| `group.update` | Info grup berubah (nama, deskripsi, pengaturan) |
| `group.participant` | Anggota grup berubah |
| `message.deleted` | Pesan dihapus |
| `message.edited` | Pesan diedit |
| `schedule.status` | Jadwal berubah status / dieksekusi |
| `broadcast.status` | Broadcast berubah status / selesai |
| `test` | Event uji dari tombol **Test** |

## Bentuk payload

Semua event memakai amplop yang sama:

```json
{
  "id": "wh_evt_01J...",
  "event": "message.received",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:00:00.000Z",
  "sessionId": "cs-utama",
  "data": { }
}
```

### `message.received`

```json
{
  "id": "wh_evt_01J...",
  "event": "message.received",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:00:00.000Z",
  "sessionId": "cs-utama",
  "data": {
    "key": {
      "id": "3EB0...",
      "remoteJid": "628123456789@s.whatsapp.net",
      "fromMe": false,
      "participant": null
    },
    "pushName": "Ayu",
    "messageTimestamp": 1761897600,
    "from": "628123456789@s.whatsapp.net",
    "receiver": "628111111111@s.whatsapp.net",
    "sender": "628123456789@s.whatsapp.net",
    "isGroup": false,
    "chatType": "PERSONAL",
    "type": "TEXT",
    "content": "berapa harga paket B?",
    "caption": null,
    "quoted": null
  }
}
```

> **Catatan privasi:** `content` berisi isi pesan dan diteruskan **live** ke endpoint Anda. PesanPro tidak menyimpannya di database, tetapi sistem Anda mungkin menyimpannya. Sesuaikan kebijakan retensi dan privasi Anda.

### `message.sent`

```json
{
  "id": "wh_evt_01J...",
  "event": "message.sent",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:00:02.000Z",
  "sessionId": "cs-utama",
  "data": {
    "jobId": "msg_01J...",
    "key": {
      "id": "3EB0...",
      "remoteJid": "628123456789@s.whatsapp.net",
      "fromMe": true
    },
    "from": "628111111111@s.whatsapp.net",
    "receiver": "628123456789@s.whatsapp.net",
    "sender": "ME",
    "isGroup": false,
    "chatType": "PERSONAL",
    "type": "TEXT",
    "content": "Halo Ayu",
    "caption": null,
    "quoted": null,
    "timestamp": 1761897602000
  }
}
```

> `jobId` hanya ada kalau pesan dikirim lewat antrean PesanPro. Untuk pengiriman langsung, field ini bisa tidak ada.

### `message.status`

```json
{
  "id": "wh_evt_01J...",
  "event": "message.status",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:00:05.000Z",
  "sessionId": "cs-utama",
  "data": {
    "messageId": "3EB0...",
    "recipient": "628123456789@s.whatsapp.net",
    "keyId": "3EB0...",
    "remoteJid": "628123456789@s.whatsapp.net",
    "status": "DELIVERED"
  }
}
```

Kalau status berasal dari antrean pesan, `data` juga bisa berisi `jobId` dan `errorCode`:

```json
{
  "jobId": "msg_01J...",
  "messageId": "3EB0...",
  "recipient": "628123456789@s.whatsapp.net",
  "status": "FAILED",
  "errorCode": "RECIPIENT_NOT_ON_WHATSAPP"
}
```

### `connection.update`

```json
{
  "id": "wh_evt_01J...",
  "event": "connection.update",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:01:00.000Z",
  "sessionId": "cs-utama",
  "data": {
    "status": "CONNECTED",
    "qr": null
  }
}
```

> Saat status `QR_REQUIRED`, field `qr` bisa berisi string QR. Jangan log atau simpan nilai itu; perlakukan seperti kredensial sementara.

### `broadcast.status`

```json
{
  "id": "wh_evt_01J...",
  "event": "broadcast.status",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:05:00.000Z",
  "sessionId": "cs-utama",
  "data": {
    "broadcastId": "bc_01J...",
    "status": "COMPLETED"
  }
}
```

### `schedule.status`

```json
{
  "id": "wh_evt_01J...",
  "event": "schedule.status",
  "apiVersion": "2026-09-04",
  "createdAt": "2026-10-31T08:00:00.000Z",
  "sessionId": "cs-utama",
  "data": {
    "scheduleId": "sch_01J...",
    "executionId": "exe_01J...",
    "status": "ENQUEUED",
    "errorCode": null
  }
}
```

Bentuk `data` untuk `group.update`, `group.participant`, `message.deleted`, dan `message.edited` mengikuti perubahan yang terjadi. Selalu baca `event` terlebih dahulu, lalu ambil field yang Anda butuhkan secara defensif.

## Header signature

Setiap request membawa tiga header:

| Header | Contoh | Arti |
| --- | --- | --- |
| `x-pesanpro-event-id` | `wh_evt_01J...` | ID unik event |
| `x-pesanpro-timestamp` | `1761897600` | Unix timestamp detik |
| `x-pesanpro-signature` | `v1=ab12...` | HMAC SHA-256 |

Rumus signature:

```
signature = HMAC_SHA256(secret, `${timestamp}.${eventId}.${rawBody}`)
```

Perhatian:

- Yang ditandatangani adalah **raw body** persis seperti diterima, bukan objek JSON yang sudah di-parse ulang.
- Timestamp harus dalam **10 digit detik**.
- Toleransi waktu **300 detik**. Request lebih lama dari itu ditolak.
- Bandingkan signature dengan **timing-safe compare**.

## Verifikasi di Node.js (Express)

```js
import crypto from "node:crypto";
import express from "express";

const app = express();

// Simpan raw body untuk verifikasi signature.
app.post(
  "/webhooks/pesanpro",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const eventId = req.header("x-pesanpro-event-id");
    const timestamp = req.header("x-pesanpro-timestamp");
    const signature = req.header("x-pesanpro-signature");
    const secret = process.env.PESANPRO_WEBHOOK_SECRET;

    if (!eventId || !timestamp || !signature || !secret) {
      return res.status(400).send("Missing signature headers");
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      return res.status(400).send("Stale timestamp");
    }

    const body = req.body.toString("utf8");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${eventId}.${body}`)
      .digest("hex");

    const actual = signature.replace(/^v1=/, "");
    const valid =
      actual.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));

    if (!valid) return res.status(401).send("Invalid signature");

    const payload = JSON.parse(body);
    // TODO: proses payload.event dan payload.data
    console.log("PesanPro event:", payload.event, payload.id);

    // Balas 2xx secepat mungkin.
    res.status(200).json({ received: true });
  }
);

app.listen(3000);
```

Kalau memakai `express.json()`, gunakan opsi `verify` agar raw body tersedia:

```js
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
```

## Verifikasi di PHP

```php
<?php

$secret = getenv('PESANPRO_WEBHOOK_SECRET');
$rawBody = file_get_contents('php://input');
$eventId = $_SERVER['HTTP_X_PESANPRO_EVENT_ID'] ?? '';
$timestamp = $_SERVER['HTTP_X_PESANPRO_TIMESTAMP'] ?? '';
$signature = $_SERVER['HTTP_X_PESANPRO_SIGNATURE'] ?? '';

if ($eventId === '' || $timestamp === '' || $signature === '' || $secret === false) {
    http_response_code(400);
    exit('Missing signature headers');
}

if (abs(time() - (int) $timestamp) > 300) {
    http_response_code(400);
    exit('Stale timestamp');
}

$expected = hash_hmac('sha256', $timestamp . '.' . $eventId . '.' . $rawBody, $secret);
$actual = preg_replace('/^v1=/', '', $signature);

if (!hash_equals($expected, $actual)) {
    http_response_code(401);
    exit('Invalid signature');
}

$payload = json_decode($rawBody, true);
if (!is_array($payload) || !isset($payload['event'])) {
    http_response_code(422);
    exit('Invalid payload');
}

// TODO: proses $payload['event'] dan $payload['data']

http_response_code(200);
header('Content-Type: application/json');
echo json_encode(['received' => true]);
```

## Idempotensi di sisi penerima

PesanPro bisa mengirim event yang sama lebih dari sekali dalam skenario retry. Simpan `x-pesanpro-event-id` yang sudah diproses selama minimal 10 menit, lalu abaikan duplikat.

Contoh dengan Redis:

```js
const key = `pesanpro:event:${eventId}`;
const firstTime = await redis.set(key, "1", { NX: true, EX: 600 });
if (!firstTime) return res.status(200).json({ duplicate: true });
```

## Retry dan timeout

- Percobaan maksimal: **8** (bisa diatur 1–12 per endpoint).
- Timeout per percobaan: **10 detik** (bisa diatur 1–30 detik).
- Backoff eksponensial dengan jitter, maksimal **15 menit** antar percobaan.
- Balasan `2xx` dianggap sukses.
- `408`, `425`, `429`, `5xx`, dan kegagalan jaringan dianggap sementara dan dicoba ulang.
- `4xx` lain dianggap permanen; event tidak dicoba ulang.

Artinya endpoint Anda harus:

1. Membalas `2xx` secepat mungkin.
2. Memproses event secara **asinkron** (queue internal) kalau butuh waktu lama.
3. Tidak melakukan pekerjaan berat sebelum membalas.

Contoh pola aman:

```js
app.post("/webhooks/pesanpro", express.raw({ type: "application/json" }), async (req, res) => {
  verifySignature(req);                 // cepat
  await queue.publish(req.body);        // cepat
  res.status(200).json({ received: true });
});
```

## Replay dan pengujian

- Dashboard menyediakan tombol **Test** untuk mengirim event `test`.
- Delivery history menampilkan status, kode HTTP, waktu, dan respons.
- Delivery yang gagal bisa di-**replay** dari dashboard.

Saat menguji:

1. Pastikan URL bisa diakses publik.
2. Pastikan HTTPS valid (bukan self-signed) di produksi.
3. Balas `2xx`.
4. Periksa signature dengan secret yang benar.
5. Cek `delivery history` untuk melihat respons server Anda.

## Checklist keamanan

1. **Selalu verifikasi signature.** Jangan percaya `event` sebelum signature valid.
2. **Tolak timestamp basi.** Maksimal 300 detik.
3. **Dedupe event ID.**
4. **Jangan log secret atau body lengkap** yang berisi data pribadi.
5. **Batasi ukuran body** di server penerima (misalnya 1 MB).
6. **Gunakan HTTPS.**
7. **Rotate secret** kalau bocor. Dashboard menyediakan rotate secret; secret lama tetap valid sebentar untuk transisi, lalu mati.
8. **Batasi IP** kalau infrastruktur Anda mendukung, tetapi jangan menggantikan signature.
