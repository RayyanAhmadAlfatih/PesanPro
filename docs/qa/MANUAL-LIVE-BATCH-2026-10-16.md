# Batch Manual/Live Test — PesanPro Pre-Launch (2026-10-16)

**Cara pakai:** satu sesi duduk, 3–4 jam. Semua perintah di bawah siap pakai.
Ganti placeholder sebelum menjalankan:

- `BASE=https://wagateway.kingofcoding.my.id`
- `TOKEN_A` / `TOKEN_B` = API key dua tenant berbeda (buat di Dashboard → Developer)
- `SESSION_A` = public sessionId milik tenant A (dari `/api/sessions`)
- Sesi cookie browser: login manual untuk test dashboard.

**ATURAN KEAMANAN:** jangan tempel token/sesi penuh di laporan. Sensor:
`wag_xxxx...xxxx`. Jangan kirim password, webhook secret, cookie.

---

## BATCH 1 — L0 Produksi & L1 Auth (≈45 menit)

| # | Test | Perintah / Langkah | Expected |
|---|------|--------------------|----------|
| B1-01 | Restart app | `pm2 restart pesanpro` (di VPS) | Semua halaman normal kembali; `/api/health/live` 200 |
| B1-02 | Restart worker | `pm2 restart pesanpro-worker-messages` (dst.) | Job QUEUED tidak hilang; heartbeat kembali (`/api/health` perlu login) |
| B1-03 | Register akun baru | UI `/auth/register` | Akun dibuat, `Subscription` TRIAL 7 hari (cek `/api/billing/summary`) |
| B1-04 | OTP email nyata | UI login → tab Email OTP | Email 6 digit masuk via SMTP; kode benar → dashboard |
| B1-05 | Reset password nyata | UI `/auth/forgot-password` → link email | Password berubah; **sesi lama otomatis logout** (uji: buka dashboard di tab lain → tendang ke login) |
| B1-06 | Session cap | Login, cek `Set-Cookie` | `Max-Age` = 86400 (24 jam), bukan 30 hari |
| B1-07 | Login gagal 5× | UI login password salah ×5 | Percobaan ke-6 dibatasi (rate limit) |
| B1-08 | Suspend user (superadmin) | `/dashboard/users` → suspend USER-A | Login USER-A ditolak; API key USER-A → 401 |

## BATCH 2 — L2 Tenant Isolation (≈45 menit) **GATE P0**

Pakai TOKEN_A dan TOKEN_B. Setiap langkah wajib PASS — satu IDOR = blocker.

```bash
# B2-01: USER-A pakai key A akses session milik B → harus 403/404
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/v1/messages/text" \
  -H "x-api-key: $TOKEN_A" -H "content-type: application/json" \
  -d '{"sessionId":"<SESSION_B>","to":"628xxx","text":"probe"}'
# Expected: 403 atau 404 (BUKAN 202)

# B2-02: tebak resource ID tenant B via GET
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/messages/<JOB_ID_MILIK_B>" \
  -H "x-api-key: $TOKEN_A"
# Expected: 404

# B2-03: media milik B via A
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/media/<MEDIA_ID_MILIK_B>" \
  -H "x-api-key: $TOKEN_A"
# Expected: 404

# B2-04: broadcast/schedule/autoreply/webhook milik B via A (ulangi pola, semua 403/404)
# B2-05: UI: USER-A buka URL dashboard resource USER-B → redirect/403, tidak ada data bocor
```

## BATCH 3 — L3 Sesi WhatsApp & L4 Messaging (≈60 menit)

Butuh HP untuk scan QR.

| # | Test | Langkah | Expected |
|---|------|---------|----------|
| B3-01 | Create session | UI → nama + custom ID | ID duplikat ditolak; karakter invalid ditolak |
| B3-02 | QR connect | UI → Start → scan dari WhatsApp | Status CONNECTED tanpa reload (socket) |
| B3-03 | Pairing code | UI → Pair by phone | Kode muncul; masuk → CONNECTED |
| B3-04 | Kirim text API | `curl -X POST "$BASE/api/v1/messages/text" -H "x-api-key: $TOKEN_A" -H "content-type: application/json" -d '{"sessionId":"<SESSION_A>","to":"628xxx","text":"Halo dari PesanPro"}'` | 202 + jobId; status QUEUED→SENT→DELIVERED di `/dashboard/message-queue` |
| B3-05 | Normalisasi nomor | kirim ke `08xxx` | Ternormalisasi benar; `628xxx` tidak dobel |
| B3-06 | Idempotency | kirim 2× dengan `Idempotency-Key` sama, payload sama | job yang sama; payload beda → 409 |
| B3-07 | Scope | key `message:read` kirim text | 403 (edge) |
| B3-08 | Upload media | `curl -X POST "$BASE/api/v1/media" -H "x-api-key: $TOKEN_A" -F "file=@foto.jpg"` | 201 + mediaId; kirim IMAGE dengan mediaId → job dibuat |
| B3-09 | MIME spoof | upload `.jpg` yang isinya teks | 422 (magic bytes) |
| B3-10 | Logout WA + delete session | UI | Auth data hilang; session tidak muncul lagi |

## BATCH 4 — L6 Queue durability & L13 Webhook (≈45 menit)

| # | Test | Langkah | Expected |
|---|------|---------|----------|
| B4-01 | Kill worker saat job QUEUED | `pm2 stop pesanpro-worker-messages`, tunggu, start lagi | Job lanjut, tidak duplicate |
| B4-02 | Cancel QUEUED | UI message-queue → cancel | CANCELLED, tidak terkirim |
| B4-03 | Cancel SENT | UI | Ditolak |
| B4-04 | Webhook receiver nyata | Buat endpoint (webhook.site / server sendiri), set secret, kirim pesan | Event `message.sent` masuk; header `X-PesanPro-Signature` valid (verifikasi HMAC SHA-256 dengan timestamp+eventId+body) |
| B4-05 | Endpoint 500 | matikan receiver sementara | Delivery FAILED + retry otomatis; log terlihat di UI |
| B4-06 | Replay | UI webhook logs → replay delivery FAILED | Delivery baru; log asli tidak berubah |
| B4-07 | Rotate secret | UI rotate | Secret lama tetap valid 24 jam (previous), lalu mati |

## BATCH 5 — L16 Billing & L18 Resilience (≈45 menit)

| # | Test | Langkah | Expected |
|---|------|---------|----------|
| B5-01 | Harga publik | `/pricing` | 3 paket (75rb/149rb/299rb bln; 750rb/1,49jt/2,99jt thn); trial tidak tampil |
| B5-02 | Kirim bukti bayar | UI billing → upload bukti | Nominal = harga plan (tidak bisa diubah klien); status PENDING |
| B5-03 | Approve (superadmin) | `/dashboard/commercial` → approve | `ACTIVE`, `endsAt` +12 bulan (yearly); **catatan: startsAt di-reset ke waktu approve (isu terbuka T-B)** |
| B5-04 | Kuota | kirim sampai limit | Operasi berikutnya ditolak 429 dengan pesan kuota |
| B5-05 | Restart app dengan queue berisi | `pm2 restart pesanpro` | Tidak ada job hilang/duplicate |
| B5-06 | Scan kebocoran | grep log & respons untuk `wag_`, `whsec_`, password, token | Tidak ada secret muncul di log/respons |
| B5-07 | `.env` publik | `curl $BASE/.env` | 404 |

## Catatan isu terbuka (bukan temuan baru)

- **T-B**: approval pembayaran me-reset `startsAt` ke waktu review — sisa masa
  aktif hilang saat perpanjangan. Sudah tercatat di memori proyek; keputusan
  produk, bukan bug QA ini.
- **T-C**: MRR di `src/lib/operations.ts:145` masih dari `priceMonthly` saja →
  overstate ~16,7% untuk pembeli tahunan. Keputusan produk/metrics.
