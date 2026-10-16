# Test Plan Teroptimasi — PesanPro Pre-Launch QA (2026-10-16)

Branch: `workbuddy-harga-tahunan-trial-2026-10-12` (baseline, sinkron dengan origin)
Strategi: **risk-based + berlapis**. Kecepatan datang dari otomasi & paralelisasi,
bukan dari memotong coverage. Jalur auth, tenant isolation, billing, dan keamanan
tidak ada jalan pintas.

## Prinsip eksekusi

1. **Lapisan OTOMATIS lebih dulu** — murah, cepat, deterministik. Kalau merah, stop
   dan perbaiki sebelum lanjut (fail fast).
2. **Audit statis berfokus risiko** — 4 auditor paralel membagi ~90 route API.
3. **Smoke live** — probe read-only ke domain produksi (health, 404, redirect,
   anti-enumerasi, edge 401).
4. **Manual/live terbatas** — hanya yang butuh kredensial/WhatsApp nyata,
   di-batch dalam satu sesi dengan perintah siap pakai.
5. **Fix SETELAH siklus test selesai** — tidak ada patch di tengah siklus.

## Peta lapisan → roadmap L0–L18

| Lapis | Cara | Cakupan roadmap | Est. waktu |
|-------|------|-----------------|-----------|
| L1 Gates otomatis | `typecheck` + `lint` + `vitest` | pondasi semua fase | ~6 menit |
| L2 Verifikasi P1 lama | baca kode + tes regresi | audit 2026-10-06 | ~15 menit |
| L3 Audit statis jalur kritis | 4 agent paralel | L1–L4, L8, L13, L14, L16 | ~25 menit |
| L4 Smoke live | curl read-only | L0 (sebagian), L14-03/04 | ~5 menit |
| L5 Manual/live (user) | batch curl + browser | L0 sisa, L1, L2, L3, L6, L13, L16, L18 | 3–4 jam (1 sesi) |
| L6 Fase perbaikan | patch minimal + gates ulang | semua temuan | ~1 jam |

## Yang diotomasi penuh (L1)

- `npm run typecheck` → 0 error (PASS)
- `npm run lint` → 0 error, 1 warning (PASS, warning dicatat sebagai temuan Low)
- `npm test` → 86 file, 357 test (PASS semua)

Suite vitest yang sudah ada sudah mencakup area paling berisiko secara deterministik:
tenant isolation (`api-auth.tenant.test.ts`), scope API key (`api-scope.test.ts`),
webhook transport & kripto (`webhook-transport.test.ts`, `webhook-crypto.test.ts`),
SSRF (`ssrf.test.ts`), billing (`billing.test.ts`), OTP/password policy, retention,
backup/restore streaming (`backup-policy.test.ts` — enkripsi + integritas +
anti-traversal), simulasi konkurensi 5000 event/32 worker (`autoreply-simulation.test.ts`).

**Tidak menambah unit test baru untuk lapisan L1** karena suite existing sudah
menutup kontrak-kontrak tersebut; audit L3 membuktikan implementasi route sesuai
kontrak. (Test regresi untuk perbaikan fase L6 ditambahkan di fase perbaikan.)

## Yang TIDAK boleh dipotong (critical path)

Wajib PASS sebelum launch, tanpa pengecualian:

- Auth: register/login/reset/OTP/session cap (`auth.config.ts`, `session-policy.ts`)
- Tenant isolation: setiap query Prisma di-scope userId (audit L3 — bersih)
- Koneksi sesi WhatsApp (butuh live — L5)
- Kirim pesan & broadcast (kontrak tervalidasi L3; live L5)
- Verifikasi signature webhook (`webhook-crypto.ts`, `webhook-transport.ts` — tervalidasi L3)
- Upload media ke B2 (`private-media*.ts` — tervalidasi L3)
- Autentikasi API key + scope + IP allowlist (tervalidasi L3)
- Billing/kuota (tamper-proof tervalidasi L3; live L5)
- Reset password via SMTP (tervalidasi L3; live L5 untuk pengiriman nyata)

## Paralelisasi

- L1: typecheck ∥ lint ∥ vitest (3 proses paralel)
- L2: baca kode paralel per temuan
- L3: 4 auditor paralel (messaging/media, webhook/session/scheduler, admin/billing, auth/keys)
- L6: perbaikan source dijalankan berurutan per file (isolasi fokus), gates dijalankan paralel

## Estimasi total siklus ini

- L1–L4 (otomatis + statis + smoke): **~50 menit** ✅ selesai
- L5 (manual/live, user): **3–4 jam** satu sesi, batch siap pakai di `MANUAL-LIVE-BATCH-2026-10-16.md`
- L6 (perbaikan + gates ulang): **~1,5 jam** termasuk build produksi (~7 menit)
