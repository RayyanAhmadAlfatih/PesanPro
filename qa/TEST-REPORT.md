# PesanPro — Test Report (fast risk-based cycle)

**Tanggal:** 2026-10-07
**Commit:** `479dbec` (branch `workbuddy/workbuddy-audit-hardening-2026-10-e171285d`)
**Target live:** https://wagateway.kingofcoding.my.id (pre-launch)
**Metode:** baseline otomatis (mesin) + verifikasi source jalur kritis + smoke live read-only.
**Aturan siklus:** tidak ada patch di tengah siklus; temuan dicatat sebagai issue, perbaikan
dilakukan setelah siklus.

Legenda verdict: **PASS** · **FAIL** · **PARTIAL** · **BLOCKED** · **NOT TESTED**

---

## 1. Baseline otomatis (Lapis L0)

| Gate | Perintah | Hasil | Verdict |
|---|---|---|---|
| TypeScript | `tsc --noEmit` | 0 error (exit 0) | **PASS** |
| Lint | `eslint .` | exit 0 | **PASS** |
| Unit/Integration | `vitest run --maxWorkers=1` | **79 file, 304 test lulus**, exit 0 | **PASS** |
| Build | `next build --webpack` | compiled; semua route tergenerasi; exit 0 | **PASS** |
| Whitespace/conflict | `git diff --check` | clean | **PASS** |
| Dependency audit | `npm audit` | **8 kerentanan (1 critical, 4 high, 3 moderate)** | **FAIL** → issue H-NEW-1 |

> Catatan environment: `tsc` awalnya gagal (`@prisma/client has no exported member 'Prisma'`)
> karena Prisma Client belum di-generate saat `npm install` (postinstall `@prisma/client`
> terlewat / esbuild postinstall `EBUSY` pada binary Node terkelola). Setelah
> `prisma generate`, typecheck **exit 0**. Ini artefak environment, bukan cacat kode.

---

## 2. Smoke live read-only (Lapis L3, subset L0 roadmap)

| ID | Test | Hasil | Verdict |
|---|---|---|---|
| L0-01 | `GET /` | HTTP 200 | **PASS** |
| L0-02 | HTTPS | HSTS `max-age=31536000`, tanpa error sertifikat | **PASS** |
| L0-03 | `GET /api/health/live` | 200 `{"status":"ok","check":"liveness",...}` | **PASS** |
| L0-04 | `GET /api/health/ready` | 200; `database.ok=true`, `storage.ok=true`, 8 worker heartbeat `ok` | **PASS** |
| L0-05 | `GET /api/health` | **401 Unauthorized** | **PARTIAL** |
| L0-13 | `GET /terms` | 200 | **PASS** |
| L0-14 | `GET /privacy` | 200 | **PASS** |
| L0-15 | `GET /<random>` | 404 custom | **PASS** |
| L18-22 | `GET /.env`, `/.git/config`, `/prisma/schema.prisma` | 404 (tidak terekspos) | **PASS** |
| L18-23 | Error API tidak bocorkan stack trace | `{"error":"Unauthorized"}` | **PASS** |
| L18-21 | Token/secret di response/log | Tidak ada yang terlihat di response publik | **PASS** |

**Catatan L0-05:** `/api/health` mengembalikan 401 **by design** — `src/proxy.ts:17`
hanya meng-allowlist anonymous probe di `/api/health/live` dan `/api/health/ready`
(diuji eksplisit oleh `src/proxy.health.test.ts`). Kebutuhan roadmap ("DB/runtime sehat")
sudah dipenuhi oleh `/api/health/ready`. Bukan bug; hanya beda dari asumsi roadmap.

---

## 3. Verifikasi source jalur kritis (Lapis L1)

### 3.1 Auth & Account (L1) — **PASS**

| Kontrol | Bukti | Verdict |
|---|---|---|
| Validasi register (nama≥2, email, password policy) | `src/app/api/auth/register/route.ts:10-14,29` | PASS |
| Rate limit register 5/jam/IP | `register/route.ts:18-25` | PASS |
| Login: bcrypt + rate limit 5/15mnt per ip+email | `src/lib/auth.ts:30,58` | PASS |
| Login tidak bocorkan keberadaan akun (audit `invalid_credentials` seragam) | `src/lib/auth.ts:44-56` | PASS |
| Reset token: SHA-256, single-use, TTL 30 mnt, divalidasi **sebelum** bcrypt | `src/lib/password-reset.ts:92-104,118-125` | PASS |
| Invalidasi sesi via `sessionVersion` + `status` tiap request | `src/lib/api-auth.ts:122`, `src/auth.config.ts:27-36` | PASS |
| Forgot-password respons seragam | `password-reset.ts:49-51,78` | PASS |
| Account enumeration pada **register** | `register/route.ts:45-50` mengembalikan "already exists" | **FAIL** → issue M-5 |
| Session timeout tidak terpakai | Tidak ada config timeout mati (`grep` bersih) | PASS (fixed) |

### 3.2 Tenant Isolation / IDOR (L2) — **PASS**

| Kontrol | Bukti | Verdict |
|---|---|---|
| `canAccessSession` scope ke `userId` (role tidak bypass ownership) | `src/lib/api-auth.ts:151-168` | PASS |
| Label add **dan** remove di-scope ke `sessionId` | `src/app/api/labels/[sessionId]/chat/[jid]/labels/route.ts:87-121` | PASS (fixed) |
| Media privat scope `tenantId` + status ACTIVE | `src/lib/private-media.ts:104-125` | PASS |
| Webhook endpoint/delivery scope tenant | `src/lib/webhook-service.ts:111-119` | PASS |
| API key & message job scope tenant | `src/lib/api-key-service.ts:118-124`, `message-job-service.ts:193-199` | PASS |
| `reconcileCampaign` tanpa predikat tenant (latent) | `src/lib/campaign-queue.ts:206-207` | **PARTIAL** → issue L-3 |

### 3.3 WhatsApp Session (L3) — **PASS**

| Kontrol | Bukti | Verdict |
|---|---|---|
| Lease/claim per sesi (single-writer) | `src/modules/whatsapp/manager.ts:236-259` | PASS |
| Aksi device butuh ownership | `src/app/api/sessions/[sessionId]/[action]/route.ts:33-41` | PASS |
| Pairing rate limit 5/15mnt | `[action]/route.ts:48-54` | PASS |
| Recovery/stop aman saat lease hilang | `manager.ts:267-288` | PASS |

### 3.4 Message Queue & Idempotency (L6/L14) — **PASS/PARTIAL**

| Kontrol | Bukti | Verdict |
|---|---|---|
| Claim atomik + lease + `attempts < maxAttempts` + dead-letter | `src/lib/message-queue.ts` (fixed) | PASS |
| Idempotency scoped `(tenantId, operation, key)` + conflict hash | `message-job-service.ts:87-91,131-135` | PASS |
| Idempotency TTL tidak ditegakkan; record kedaluwarsa tidak dibersihkan | `message-job-service.ts:87-91,168-176` | **PARTIAL** → issue L-7 |

### 3.5 Webhook (L13) — **PASS/PARTIAL**

| Kontrol | Bukti | Verdict |
|---|---|---|
| HMAC `timestamp.eventId.body`, `timingSafeEqual`, toleransi ±300s, replay | `src/lib/webhook-contract.ts:58-84` | PASS |
| Secret AES-256-GCM at-rest; respons hanya `hasSecret`/`secretVersion` | `src/lib/webhook-crypto.ts:30-49`, `webhook-service.ts:45-73` | PASS |
| Tenant scoping endpoint/delivery | `webhook-service.ts:111-119` | PASS |
| Rate limit tujuan webhook hanya by hostname (dibagi antar tenant) | `src/lib/webhook-outbox.ts:344-345` | **PARTIAL** → issue L-1 |
| Kegagalan media/webhook ditelan `catch {}` tanpa log | `src/lib/webhook.ts:214,328,402` | **PARTIAL** → issue L-4 |

### 3.6 Media & B2 (L8) — **PASS/PARTIAL**

| Kontrol | Bukti | Verdict |
|---|---|---|
| Path containment (`normalizeStoragePath` + `resolvePrivateMediaPath`) | `src/lib/private-media-storage.ts:28-47` | PASS |
| Magic-byte + allowlist MIME (tanpa svg/html) | `private-media-validation.ts` | PASS |
| Checksum SHA-256 + karantina saat mismatch | `private-media.ts:111-115` | PASS |
| SSRF webhook media ditutup (`safeFetchBuffer` + cap) | `src/lib/webhook.ts:126` | PASS (fixed) |
| Arbitrary write via mimetype/key.id ditutup | `webhook.ts:55-67,169-175` | PASS (fixed) |
| Payment proof **tidak** dihitung ke `MEDIA_STORAGE_BYTES` | `src/lib/payment-proof.ts:141-167` | **FAIL** → issue M-4 |
| `/api/health/ready` bocorkan path absolut + kapasitas disk + topologi worker | response live | **PARTIAL** → issue L-NEW-2 |

### 3.7 API Key & Developer API (L14) — **PASS**

| Kontrol | Bukti | Verdict |
|---|---|---|
| Hash at-rest + migrasi legacy plaintext (tanpa mengembalikan plaintext) | `src/lib/api-key-auth.ts:50-99` | PASS (fixed) |
| Scope fail-closed (`getRequiredApiScope` null → tidak boleh) | `src/lib/api-scope-policy.ts:35`, `api-auth.ts:106-109` | PASS |
| IP allowlist normalisasi + validasi | `api-key-service.ts:47-65` | PASS |
| Rate limit + quota per key di proxy | `src/proxy.ts:77-110` | PASS |
| Revoke/rotate langsung invalid | `api-key-service.ts:146-179` | PASS |

### 3.8 Billing & Quota (L16) — **PASS/PARTIAL**

| Kontrol | Bukti | Verdict |
|---|---|---|
| Reservasi atomic + cek `consumed+reserved+amount` + retry P2034 | `src/lib/usage.ts:125-218` | PASS |
| Reservasi storage tidak yatim saat settle/delete gagal | `src/lib/storage-quota.ts:18-36`, `private-media.ts:153-167` | PASS (fixed) |
| Entitlement: trial/active/grace/expired | `src/lib/billing.ts:35-59,120` | PASS |
| Payment proof tidak masuk accounting | `payment-proof.ts` | **FAIL** → issue M-4 |

### 3.9 Kepatuhan & deployment — **PARTIAL**

| Item | Bukti | Verdict |
|---|---|---|
| `TRUST_PROXY` di belakang nginx (live pakai nginx) | `src/server/runtime.ts:50-55`; default `false` | **NOT TESTED / OBS** |
| Security headers HTML (CSP/XFO/nosniff/Referrer-Policy) | Header live: hanya HSTS | **FAIL** → issue M-NEW-1 |
| `X-Powered-By: Next.js` | Header live | **PARTIAL** → issue L-NEW-1 |

---

## 4. Ringkasan verdict per area

| Area | Verdict | Catatan |
|---|---|---|
| Auth & Account | **PASS*** | *kecuali M-5 (enumeration register) |
| Tenant Isolation / IDOR | **PASS** | kecuali L-3 (latent, internal-only) |
| WhatsApp Session | **PASS** | — |
| Message Queue / Idempotency | **PASS*** | *kecuali L-7 (TTL idempotency) |
| Webhook | **PASS*** | *kecuali L-1, L-4 |
| Media / B2 | **PASS*** | *kecuali M-4, L-NEW-2 |
| API Key / Dev API | **PASS** | — |
| Billing / Quota | **PASS*** | *kecuali M-4 |
| Dependencies | **FAIL** | H-NEW-1 (1 critical, 4 high) |
| Headers / Hardening | **FAIL** | M-NEW-1, L-NEW-1 |

---

## 5. Yang belum diuji (dan alasannya)

| Area | Status | Alasan / cara menutup |
|---|---|---|
| L4 (Chat UI), L5 (WA ops), L7 (labels UI), L9–L12 (broadcast/campaign/schedule/autoreply UI), L15 (integrasi), L17 (users/settings/notif UI) | **NOT TESTED** | Butuh browser + device WhatsApp + akun QA; dijalankan sebagai batch manual (Lapis L4–L6) |
| L6/L18 (restart worker, kill saat PROCESSING, backup/restore, webhook down→up) | **BLOCKED** | Butuh environment staging + kontrol proses; dijalankan sebagai resilience drill |
| L1-13 (rate limit login) live | **PARTIAL** | NextAuth selalu 302 pada kegagalan; limit hanya terverifikasi via source. Verifikasi live butuh log server / header 429 dari endpoint khusus |
| L1-01/02..09 (register) live | **NOT TESTED** | Sengaja tidak dijalankan: bila `TRUST_PROXY` salah, bucket `register:${ip}` global → bisa memblok registrasi nyata 1 jam |
| L16 (billing UI), L15 (integrasi eksternal) | **NOT TESTED** | Butuh akun + sandbox eksternal |

---

## 6. Temuan (ringkas — detail di `GITHUB-ISSUES.md`)

| ID | Severity | Ringkasan | Status |
|---|---|---|---|
| H-NEW-1 | **High** | Kerentanan dependency: Next.js RCE (critical, `next/og` dipakai di `src/app/icon.tsx`), engine.io DoS (override pin versi rentan), sharp librsvg CVE, source-map-js DoS | **FIXED** — next 16.4.0, sharp 0.35.5, engine.io 6.6.11, source-map-js 1.2.2; audit produksi 0 critical/0 high |
| M-NEW-1 | Medium | Security headers HTML hilang (CSP/XFO/nosniff/Referrer-Policy/Permissions-Policy) | **FIXED** — `next.config.mjs` `headers()` |
| M-4 | Medium | Payment proof tidak masuk accounting `MEDIA_STORAGE_BYTES` | **FIXED** — `runWithStorageQuota` + release saat delete |
| M-5 | Medium | Account enumeration pada register | **DEFERRED** — butuh keputusan produk (mengubah kontrak API + UX signup) |
| L-1 | Low | Rate limit tujuan webhook dibagi antar tenant | **FIXED** — key ditambah `tenantId` |
| L-2 | Low | Schedule/broadcast retry tanpa cap/backoff | **FIXED (schedule)** — backoff + cap 5; cap broadcast **DEFERRED** (butuh kolom `attempts`) |
| L-3 | Low | `reconcileCampaign` tanpa predikat tenant | **FIXED** — `findFirst`/`updateMany` ber-`tenantId` |
| L-4 | Low | `catch {}` menelan kegagalan webhook/media | **FIXED** — log via `logger` |
| L-5 | Low | forgot-password sukses padahal email tidak terkirim | **FIXED** — log operator eksplisit (respons user tetap seragam) |
| L-6 | Low | N+1 query per-recipient di loop broadcast | **DEFERRED** — butuh restrukturisasi batch pada jalur berjalan |
| L-7 | Low | TTL idempotency tidak ditegakkan & tidak dipurge | **PARTIAL** — purge kedaluwarsa ditambahkan; reuse penuh butuh keputusan produk |
| L-8 | Low | Counter throttle auto-reply dikonsumsi sebelum enqueue | **DEFERRED** — butuh simpan state cooldown sebelumnya |
| L-9 | Low | `.env.example` memuat placeholder admin | **FIXED** — `ADMIN_*` dikosongkan + komentar |
| L-NEW-1 | Low | `X-Powered-By: Next.js` terlepas | **FIXED** — `poweredByHeader: false` |
| L-NEW-2 | Low | `/api/health/ready` bocorkan path absolut + disk + topologi worker | **FIXED** — redaksi respons publik |
| OBS-1 | Deployment | `TRUST_PROXY` di belakang nginx belum diverifikasi | **OPEN (operator)** — sudah didokumentasikan di `.env.example`; nilai live harus dicek di server |

**Ringkasan siklus fix:** 10 temuan **FIXED**, 1 **PARTIAL**, 4 **DEFERRED** (dengan alasan keras),
1 **OPEN** (aksi operator). Detail + cara verifikasi ada di `qa/CHANGE-SUMMARY.md`.

**4 temuan P1 audit sebelumnya (SSRF, plaintext API key, label lintas tenant, session timeout):
terverifikasi SUDAH diperbaiki di commit ini — tidak dilaporkan ulang.**
