# 05 — API untuk developer

PesanPro menyediakan REST API untuk mengirim pesan, mengelola media, menjadwalkan pesan, menjalankan broadcast, mengatur auto-reply, dan mengelola suppression.

Semua contoh di sini memakai domain gateway:

```
https://wagateway.kingofcoding.my.id
```

## Autentikasi

Setiap request API memakai header `x-api-key`:

```http
x-api-key: wag_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API key dibuat di dashboard: **Developer → Create API key**.

Aturan:

- Secret hanya ditampilkan **sekali** saat dibuat atau di-rotate.
- Simpan di secret manager atau environment variable.
- Jangan pernah menaruh API key di kode frontend, aplikasi mobile, atau repositori publik.
- API key bisa dibatasi per **scope**, **IP allowlist**, dan **tanggal kedaluwarsa**.

> **Jangan memakai `Authorization: Bearer` untuk API key.** Header itu hanya dipakai integration token (`ppint_...`). API key yang dikirim lewat `Authorization` tidak akan dikenali.

## Scope

Pilih scope minimum yang dibutuhkan integrasi Anda.

| Scope | Memberi akses ke |
| --- | --- |
| `device:read` | Daftar perangkat, status, QR |
| `device:write` | Membuat, start, stop, restart, logout perangkat |
| `message:read` | Daftar dan detail pesan |
| `message:send` | Kirim teks dan media |
| `media:read` | Daftar dan metadata media |
| `media:write` | Upload dan hapus media |
| `schedule:read` | Daftar jadwal |
| `schedule:write` | Buat, ubah, hapus jadwal |
| `broadcast:read` | Daftar broadcast dan suppression |
| `broadcast:write` | Buat, pause, resume broadcast; kelola suppression |
| `autoreply:read` | Daftar aturan dan log auto-reply |
| `autoreply:write` | Buat, ubah, hapus, toggle aturan |
| `webhook:read` | Daftar webhook dan integration token |
| `webhook:write` | Buat, ubah, tes, rotate secret, replay delivery |

Request dengan scope kurang ditolak `401` atau `403` (fail-closed).

## Bentuk respons

Sukses:

```json
{
  "requestId": "c1f2e3d4-...",
  "data": { }
}
```

Sukses dengan pagination:

```json
{
  "requestId": "c1f2e3d4-...",
  "data": [ ],
  "meta": { "nextCursor": "..." }
}
```

Error:

```json
{
  "requestId": "c1f2e3d4-...",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "recipient", "message": "Required" }
    ]
  }
}
```

Selalu sertakan `x-request-id` di log aplikasi Anda. Kalau ada masalah, ID ini mempercepat investigasi.

## Idempotency

Semua operasi tulis yang membuat pesan, jadwal, atau broadcast **wajib** menyertakan header:

```http
Idempotency-Key: order-2026-10-31-0001
```

Aturan:

- 8–128 karakter.
- Hanya huruf, angka, titik, garis bawah, titik dua, dan garis hubung.
- Gunakan ID bisnis yang stabil, misalnya nomor order atau ID transaksi.
- Request ulang dengan key yang sama mengembalikan hasil yang sama, bukan membuat pekerjaan ganda.

Contoh key yang baik:

```
order-1042-invoice
broadcast-promo-2026-10
schedule-reminder-2026-11-01
```

## Rate limit

| Paket | Permintaan API per menit |
| --- | --- |
| Starter | 30 |
| Bisnis | 60 |
| Pro | 150 |

Kalau terlampaui, API mengembalikan `429` dengan `code: "QUOTA_EXCEEDED"` atau `RATE_LIMITED`. Hormati header `Retry-After` kalau tersedia, dan gunakan exponential backoff.

## Katalog endpoint

### Perangkat

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `GET` | `/api/sessions` | `device:read` | Daftar perangkat |
| `POST` | `/api/sessions` | `device:write` | Buat perangkat |
| `GET` | `/api/sessions/{sessionId}` | `device:read` | Detail perangkat |
| `GET` | `/api/sessions/{sessionId}/qr` | `device:read` | QR / pairing code |
| `POST` | `/api/sessions/{sessionId}/start` | `device:write` | Mulai |
| `POST` | `/api/sessions/{sessionId}/stop` | `device:write` | Hentikan |
| `POST` | `/api/sessions/{sessionId}/restart` | `device:write` | Restart |
| `POST` | `/api/sessions/{sessionId}/logout` | `device:write` | Logout |

### Pesan

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `POST` | `/api/v1/messages/text` | `message:send` | Kirim teks |
| `POST` | `/api/v1/messages/media` | `message:send` | Kirim media |
| `GET` | `/api/v1/messages` | `message:read` | Daftar pesan |
| `GET` | `/api/v1/messages/{id}` | `message:read` | Detail pesan |
| `DELETE` | `/api/v1/messages/{id}` | `message:send` | Batalkan pesan yang belum terkirim |
| `POST` | `/api/v1/messages/{id}/retry` | `message:send` | Kirim ulang |

### Media

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `POST` | `/api/v1/media` | `media:write` | Upload media |
| `GET` | `/api/v1/media` | `media:read` | Daftar media |
| `GET` | `/api/v1/media/{id}?metadata=1` | `media:read` | Metadata |
| `DELETE` | `/api/v1/media/{id}` | `media:write` | Hapus media |
| `POST` | `/api/v1/media/import` | `media:write` | Impor dari URL |

### Jadwal

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `POST` | `/api/v1/schedules` | `schedule:write` | Buat jadwal |
| `GET` | `/api/v1/schedules?sessionId=...` | `schedule:read` | Daftar jadwal |
| `PUT` | `/api/v1/schedules/{id}` | `schedule:write` | Ubah jadwal |
| `DELETE` | `/api/v1/schedules/{id}` | `schedule:write` | Hapus jadwal |

### Broadcast

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `POST` | `/api/v1/broadcasts` | `broadcast:write` | Buat broadcast |
| `GET` | `/api/v1/broadcasts?sessionId=...` | `broadcast:read` | Daftar broadcast |
| `GET` | `/api/v1/broadcasts/{id}` | `broadcast:read` | Detail |
| `POST` | `/api/v1/broadcasts/{id}/pause` | `broadcast:write` | Jeda |
| `POST` | `/api/v1/broadcasts/{id}/resume` | `broadcast:write` | Lanjutkan |
| `POST` | `/api/v1/broadcasts/recipients/import` | `broadcast:write` | Import CSV |
| `POST` | `/api/v1/broadcasts/spintax/preview` | `broadcast:write` | Pratinjau spintax |

### Auto-reply

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `POST` | `/api/v1/autoreplies` | `autoreply:write` | Buat aturan |
| `GET` | `/api/v1/autoreplies?sessionId=...` | `autoreply:read` | Daftar aturan |
| `PUT` | `/api/v1/autoreplies/{id}` | `autoreply:write` | Ubah aturan |
| `DELETE` | `/api/v1/autoreplies/{id}` | `autoreply:write` | Hapus aturan |
| `POST` | `/api/v1/autoreplies/{id}/toggle` | `autoreply:write` | Aktif/nonaktif |
| `POST` | `/api/v1/autoreplies/preview` | `autoreply:read` | Uji tanpa kirim |
| `GET` | `/api/v1/autoreplies/logs?sessionId=...` | `autoreply:read` | Log pemicu |

### Suppression

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `GET` | `/api/v1/suppressions` | `broadcast:read` | Daftar nomor |
| `POST` | `/api/v1/suppressions` | `broadcast:write` | Tambah nomor |
| `DELETE` | `/api/v1/suppressions/{recipient}` | `broadcast:write` | Hapus nomor |

### Integration token

| Method | Path | Scope | Fungsi |
| --- | --- | --- | --- |
| `POST` | `/api/v1/integration-tokens` | `webhook:write` | Buat token integrasi |
| `GET` | `/api/v1/integration-tokens` | `webhook:read` | Daftar token |
| `DELETE` | `/api/v1/integration-tokens/{id}` | `webhook:write` | Cabut token |

## Format nomor penerima

PesanPro menormalkan nomor secara otomatis:

| Anda kirim | Disimpan sebagai |
| --- | --- |
| `08123456789` | `628123456789@s.whatsapp.net` |
| `+62 812-3456-789` | `628123456789@s.whatsapp.net` |
| `628123456789` | `628123456789@s.whatsapp.net` |
| `1203630xxxx@g.us` | tetap (grup) |

Aturan:

- Nomor lokal Indonesia diawali `08` dikonversi ke `62`.
- Nomor internasional minimal 7 digit, maksimal 20 digit.
- JID grup (`@g.us`) dan LID (`@lid`) diterima apa adanya.
- Format lain ditolak `INVALID_RECIPIENT` (422).

## Kirim pesan teks

### cURL

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/messages/text" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042-notify" \
  -d '{
    "sessionId": "cs-utama",
    "recipient": "628123456789",
    "text": "Halo Ayu, pesanan #1042 sudah kami terima."
  }'
```

Respons `202 Accepted`:

```json
{
  "requestId": "c1f2...",
  "data": {
    "id": "msg_01J...",
    "status": "PENDING",
    "recipient": "628123456789@s.whatsapp.net",
    "type": "TEXT",
    "createdAt": "2026-10-31T08:00:00.000Z"
  }
}
```

Status pesan:

```
PENDING → PROCESSING → SENT → DELIVERED → READ
                    ↘ RETRYING → SENT
                    ↘ FAILED
```

### Node.js (fetch, Node 18+)

```js
const BASE_URL = "https://wagateway.kingofcoding.my.id";
const API_KEY = process.env.PESANPRO_API_KEY;

async function sendText({ sessionId, recipient, text, idempotencyKey }) {
  const response = await fetch(`${BASE_URL}/api/v1/messages/text`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ sessionId, recipient, text }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? "PesanPro request failed");
    error.code = payload.error?.code;
    error.requestId = payload.requestId;
    throw error;
  }
  return payload.data;
}

await sendText({
  sessionId: "cs-utama",
  recipient: "628123456789",
  text: "Halo Ayu, pesanan #1042 sudah kami terima.",
  idempotencyKey: "order-1042-notify",
});
```

### PHP (cURL)

```php
<?php

function pesanpro_send_text(string $sessionId, string $recipient, string $text, string $idempotencyKey): array
{
    $baseUrl = 'https://wagateway.kingofcoding.my.id';
    $apiKey = getenv('PESANPRO_API_KEY');

    $ch = curl_init("$baseUrl/api/v1/messages/text");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'x-api-key: ' . $apiKey,
            'Content-Type: application/json',
            'Idempotency-Key: ' . $idempotencyKey,
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'sessionId' => $sessionId,
            'recipient' => $recipient,
            'text' => $text,
        ]),
        CURLOPT_TIMEOUT => 15,
    ]);

    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $payload = json_decode($body, true);
    if ($status >= 400) {
        throw new RuntimeException($payload['error']['message'] ?? 'PesanPro request failed');
    }
    return $payload['data'];
}
```

## Kirim media

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/messages/media" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: invoice-1042-pdf" \
  -d '{
    "sessionId": "cs-utama",
    "recipient": "628123456789",
    "type": "DOCUMENT",
    "mediaId": "med_01J...",
    "caption": "Invoice #1042",
    "fileName": "invoice-1042.pdf",
    "mimeType": "application/pdf"
  }'
```

Field `type`: `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`.

Isi tepat satu dari:

- `mediaId`
- `imageUrl` (untuk IMAGE)
- `videoUrl` (untuk VIDEO)
- `audioUrl` (untuk AUDIO)
- `documentUrl` (untuk DOCUMENT)

Batas ukuran dan format ada di [04 — Media dan batas upload](04-media-dan-limit-upload.md).

## Jadwal

### Satu kali

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/schedules" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "cs-utama",
    "recipient": "628123456789",
    "text": "Pengingat: besok toko tutup pukul 12.00.",
    "localDateTime": "2026-11-01T08:00:00",
    "timezone": "Asia/Jakarta",
    "kind": "ONE_TIME",
    "missedRunPolicy": "SEND_LATE",
    "misfireGraceSeconds": 300
  }'
```

### Berulang (cron)

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/schedules" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "cs-utama",
    "recipient": "628123456789",
    "text": "Pengingat harian: jangan lupa absen.",
    "localDateTime": "2026-11-01T08:00:00",
    "timezone": "Asia/Jakarta",
    "kind": "RECURRING",
    "cronExpression": "0 8 * * 1-5",
    "missedRunPolicy": "SKIP",
    "misfireGraceSeconds": 300
  }'
```

`cronExpression` memakai 5 field: `menit jam tanggal bulan hari`.

| Contoh | Arti |
| --- | --- |
| `0 9 * * *` | Setiap hari 09.00 |
| `0 9 * * 1-5` | Senin–Jumat 09.00 |
| `0 8 1 * *` | Tanggal 1 setiap bulan 08.00 |
| `30 18 * * 5` | Jumat 18.30 |

`missedRunPolicy`:

| Nilai | Arti kalau server sempat mati |
| --- | --- |
| `SEND_LATE` | Kirim terlambat begitu server hidup |
| `SKIP` | Lewati kejadian yang terlewat |
| `CANCEL` | Batalkan jadwal |

`misfireGraceSeconds` menentukan berapa lama keterlambatan masih dianggap wajar.

## Broadcast

Contoh lengkap ada di [02 — Broadcast](02-broadcast.md). Ringkasnya:

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/broadcasts" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: promo-oktober-2026" \
  -d '{
    "sessionId": "cs-utama",
    "name": "Promo Oktober",
    "recipients": ["628123456789"],
    "message": "Halo, promo Oktober sudah dimulai.",
    "delayMinMs": 10000,
    "delayMaxMs": 20000
  }'
```

## Auto-reply

Contoh lengkap ada di [03 — Auto-reply](03-auto-reply.md).

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
    "isEnabled": true
  }'
```

## Suppression

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/suppressions" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "recipient": "628123456789", "reason": "MANUAL" }'
```

`reason`: `MANUAL` atau `ADMIN`.

## Integration token

Integration token dipakai oleh integrasi form/toko online. Berbeda dari API key:

- Prefix `ppint_`.
- Dikirim lewat `x-integration-token` atau `Authorization: Bearer`.
- Terikat ke satu perangkat dan satu jenis integrasi.
- Bisa punya mapping penerima dan template pesan.

```bash
curl -X POST "https://wagateway.kingofcoding.my.id/api/v1/integration-tokens" \
  -H "x-api-key: wag_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Contact Form 7 - Toko Ayu",
    "type": "CONTACT_FORM_7",
    "sessionId": "cs-utama",
    "mapping": {
      "recipientField": "whatsapp",
      "messageTemplate": "Pesan baru dari {{field:nama}}: {{message}}"
    }
  }'
```

Tipe yang tersedia: `WORDPRESS`, `CONTACT_FORM_7`, `WOOCOMMERCE`, `GOOGLE_FORMS`.

## SDK mini Node.js

Simpan sebagai `pesanpro.js`. Tidak perlu dependensi eksternal.

```js
import crypto from "node:crypto";

export class PesanProClient {
  constructor({ apiKey, baseUrl = "https://wagateway.kingofcoding.my.id" }) {
    if (!apiKey) throw new Error("apiKey is required");
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request(path, { method = "GET", body, idempotencyKey, headers = {} } = {}) {
    const finalHeaders = {
      "x-api-key": this.apiKey,
      ...headers,
    };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    if (idempotencyKey) finalHeaders["Idempotency-Key"] = idempotencyKey;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      error.code = payload?.error?.code;
      error.status = response.status;
      error.requestId = payload?.requestId;
      throw error;
    }
    return payload;
  }

  sendText(input) {
    return this.request("/api/v1/messages/text", {
      method: "POST",
      body: input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    });
  }

  sendMedia(input) {
    return this.request("/api/v1/messages/media", {
      method: "POST",
      body: input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    });
  }

  getMessage(id) {
    return this.request(`/api/v1/messages/${encodeURIComponent(id)}`);
  }

  createBroadcast(input) {
    return this.request("/api/v1/broadcasts", {
      method: "POST",
      body: input,
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    });
  }

  listBroadcasts(sessionId) {
    return this.request(`/api/v1/broadcasts?sessionId=${encodeURIComponent(sessionId)}`);
  }

  createSchedule(input) {
    return this.request("/api/v1/schedules", { method: "POST", body: input });
  }

  listSchedules(sessionId) {
    return this.request(`/api/v1/schedules?sessionId=${encodeURIComponent(sessionId)}`);
  }
}
```

Pemakaian:

```js
import { PesanProClient } from "./pesanpro.js";

const client = new PesanProClient({ apiKey: process.env.PESANPRO_API_KEY });

const result = await client.sendText({
  sessionId: "cs-utama",
  recipient: "628123456789",
  text: "Halo dari SDK mini",
  idempotencyKey: "order-1042-notify",
});

console.log(result.data.id, result.data.status);
```

## SDK mini PHP

```php
<?php

final class PesanProClient
{
    public function __construct(
        private string $apiKey,
        private string $baseUrl = 'https://wagateway.kingofcoding.my.id'
    ) {
        $this->baseUrl = rtrim($this->baseUrl, '/');
    }

    public function request(string $path, string $method = 'GET', ?array $body = null, ?string $idempotencyKey = null): array
    {
        $headers = ['x-api-key: ' . $this->apiKey];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($idempotencyKey !== null) {
            $headers[] = 'Idempotency-Key: ' . $idempotencyKey;
        }

        $ch = curl_init($this->baseUrl . $path);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 20,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $payload = json_decode($raw, true);
        if ($status >= 400) {
            throw new RuntimeException($payload['error']['message'] ?? 'PesanPro request failed', $status);
        }
        return $payload;
    }

    public function sendText(string $sessionId, string $recipient, string $text, string $idempotencyKey): array
    {
        return $this->request('/api/v1/messages/text', 'POST', [
            'sessionId' => $sessionId,
            'recipient' => $recipient,
            'text' => $text,
        ], $idempotencyKey);
    }
}
```

## Pola integrasi yang aman

1. **Simpan API key di server.** Jangan pernah di browser.
2. **Pakai idempotency key yang stabil.** Jangan generate ulang saat retry.
3. **Retry hanya untuk error sementara.** `429`, `500`, `502`, `503`, `504`, timeout. Jangan retry `400`, `401`, `403`, `422`.
4. **Gunakan exponential backoff.** Contoh: 1 detik, 2 detik, 4 detik, 8 detik, maksimal 5 percobaan.
5. **Pantau `requestId`.** Simpan di log bersama ID pesanan.
6. **Batasi scope.** Kalau hanya mengirim pesan, jangan beri `device:write`.
7. **Rotate key berkala.** Buat key baru, deploy, lalu cabut key lama.
8. **Jangan log isi pesan.** Simpan metadata saja.

## Kode error yang perlu ditangani

| HTTP | Code | Arti | Tindakan |
| --- | --- | --- | --- |
| 400 | `INVALID_MULTIPART_BODY` | Body multipart rusak | Perbaiki request |
| 401 | `UNAUTHORIZED` | API key tidak ada/salah | Periksa header |
| 403 | `ENTITLEMENT_DENIED` | Paket tidak mencakup fitur | Aktifkan paket / naik paket |
| 404 | `SESSION_NOT_FOUND` | Perangkat tidak ada | Periksa `sessionId` |
| 409 | `AUTOREPLY_RULE_LIMIT_REACHED` | Batas aturan habis | Hapus aturan / naik paket |
| 413 | `MEDIA_TOO_LARGE` | File melebihi batas | Kecilkan file |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Format tidak didukung | Konversi file |
| 422 | `VALIDATION_ERROR` | Field salah | Baca `details` |
| 422 | `INVALID_RECIPIENT` | Nomor tidak valid | Perbaiki nomor |
| 429 | `QUOTA_EXCEEDED` | Kuota pesan habis | Tunggu / naik paket |
| 429 | `RATE_LIMITED` | Terlalu banyak request | Backoff |
| 500 | `INTERNAL_ERROR` | Kesalahan server | Retry dengan backoff, hubungi admin bila tetap |

## Uji cepat dengan health check

```bash
curl "https://wagateway.kingofcoding.my.id/api/health/live"
curl "https://wagateway.kingofcoding.my.id/api/health/ready"
```

`live` menandakan proses hidup. `ready` menandakan database dan worker siap.
