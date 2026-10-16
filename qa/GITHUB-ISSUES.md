# PesanPro — GitHub issue bodies (QA cycle 2026-10-07)

Siap-di-file. Setiap issue memuat severity, label, bukti `file:line`, langkah reproduksi, dan dampak.
`gh` CLI tidak tersedia di environment ini, jadi issue belum dibuat otomatis — file ini adalah
sumber siap-tempel (atau hubungkan GitHub connector / install `gh` untuk membuatnya sekaligus).

**Catatan:** 4 temuan P1 audit sebelumnya (SSRF download media webhook, fallback API key plaintext,
penghapusan label lintas tenant, session timeout tak terpakai) **sudah terverifikasi fixed** di
commit `479dbec` dan **tidak** dilaporkan ulang di sini.

## Status setelah siklus fix (2026-10-07)

Perbaikan sudah diterapkan untuk sebagian besar temuan. Saat membuat issue, tandai statusnya:

| Issue | Status | Catatan |
|---|---|---|
| H-NEW-1 dependency | **FIXED** | next 16.4.0, sharp 0.35.5, engine.io 6.6.11, source-map-js 1.2.2 |
| M-NEW-1 security headers | **FIXED** | `next.config.mjs` `headers()` |
| M-4 payment proof quota | **FIXED** | `runWithStorageQuota` + release |
| M-5 register enumeration | **OPEN** | butuh keputusan produk (kontrak + UX) |
| L-1 webhook dest limit | **FIXED** | key + tenantId |
| L-2 retry cap | **FIXED (schedule)** | cap broadcast butuh kolom `attempts` → OPEN |
| L-3 reconcileCampaign tenant | **FIXED** | findFirst/updateMany ber-tenantId |
| L-4 bare catch | **FIXED** | log via logger |
| L-5 forgot-password email | **FIXED** | log operator eksplisit |
| L-6 N+1 broadcast | **OPEN** | butuh restrukturisasi batch |
| L-7 idempotency TTL | **PARTIAL** | purge ditambahkan; reuse penuh OPEN |
| L-8 autoreply throttle | **OPEN** | butuh state cooldown sebelumnya |
| L-9 .env placeholder | **FIXED** | ADMIN_* dikosongkan |
| L-NEW-1 X-Powered-By | **FIXED** | `poweredByHeader:false` |
| L-NEW-2 /health/ready leak | **FIXED** | redaksi respons |
| OBS-1 TRUST_PROXY | **OPEN (operator)** | set di server |

---

## [HIGH] Kerentanan dependency: Next.js RCE (critical) + engine.io/sharp/source-map-js

**Severity:** High
**Labels:** `security`, `dependencies`
**Bukti:** `npm audit` (commit `479dbec`) → 8 kerentanan (1 critical, 4 high, 3 moderate).
- **critical** `next@16.3.3` → RCE di `next/og` ImageResponse (GHSA-vcvr-r3jv-pc5j). **Terekspos:** `src/app/icon.tsx:1` mengimpor `ImageResponse` dari `next/og`; route `/icon` tergenerasi di build. Fix: `next@16.4.0`.
- **high** `engine.io@6.6.9` (dipin paksa oleh `package.json` `overrides`) → Protocol Revision Mismatch DoS (GHSA-2gc4-cqfq-p2gv). Rentang rentan `6.6.0 - 6.6.9` — override justru memaku versi rentan. Dipakai `socket.io` (realtime dashboard).
- **high** `sharp@0.35.4` → librsvg CVE-2026-96889 (GHSA-wq5f-xc86-pv6w). Dipakai `src/lib/media-optimization.ts`, `src/lib/sticker.ts`. Fix: `sharp@0.35.5`.
- **high** `source-map-js@<=1.2.1` → event-loop DoS (GHSA-68fv-2mgg-jv7q).
- **moderate** `moment@2.30.1` (path traversal locale), `postcss-selector-parser@<7.1.6` (CPU), `braces` (dev-only).

**Reproduksi:**
```bash
npm audit
npm audit --omit=dev
```
**Dampak:** RCE pre-auth pada endpoint OG image (kritis untuk SaaS publik) + DoS realtime & media.
**Fix:** naikkan `next` ke `16.4.0`, `sharp` ke `0.35.5`, perbarui `overrides.engine.io` ke versi
yang dipatch, `npm audit fix` untuk sisanya. Uji ulang gate setelah upgrade.

---

## [MEDIUM] Security headers HTML hilang (clickjacking / MIME sniffing)

**Severity:** Medium
**Labels:** `security`, `hardening`
**Bukti:** Response header live `GET https://wagateway.kingofcoding.my.id/` hanya memuat
`Strict-Transport-Security`. **Tidak ada** `Content-Security-Policy`,
`X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`. `next.config.mjs` tidak mendefinisikan `headers()`.

**Reproduksi:**
```bash
curl -sI https://wagateway.kingofcoding.my.id/ | grep -iE "content-security|x-frame|x-content-type|referrer-policy|permissions-policy"
# (kosong)
```
**Dampak:** dashboard rentan clickjacking (tanpa `frame-ancestors`/XFO); tanpa `nosniff`,
browser dapat men-sniff konten. Menurunkan postur keamanan app yang menangani auth & billing.
**Fix:** tambahkan `headers()` di `next.config.mjs` (CSP minimal + XFO DENY + nosniff +
Referrer-Policy + Permissions-Policy), verifikasi tidak merusak Next.js inline runtime.

---

## [MEDIUM] Payment proof tidak masuk accounting `MEDIA_STORAGE_BYTES`

**Severity:** Medium
**Labels:** `bug`, `billing`
**Bukti:** `src/lib/payment-proof.ts:141-167` — `storePaymentProof` memanggil
`storePrivateMediaObject` **tanpa** `runWithStorageQuota` (bandingkan `src/lib/private-media.ts:71-100`).
`deleteStoredPaymentProof` (`:169-171`) tidak melepaskan apa pun.

**Reproduksi:** `POST /api/payment-verifications` dengan PDF ~5 MB → `UsageCounter.consumed`
untuk `MEDIA_STORAGE_BYTES` tidak berubah.
**Dampak:** byte bukti bayar tak pernah dihitung/ditagih → pertumbuhan object storage tak terbatas
(dibatasi hanya 5/jam ≈ 600 MB/hari/akun).
**Fix:** bungkus store dengan `runWithStorageQuota`, dan lepaskan kuota saat delete/replace
(perlu meneruskan `userId` + `sizeBytes` ke `deleteStoredPaymentProof` dan pemanggilnya).

---

## [MEDIUM] Account enumeration pada registrasi

**Severity:** Medium
**Labels:** `security`, `auth`
**Bukti:** `src/app/api/auth/register/route.ts:45-50` mengembalikan
`{"error":"User with this email already exists"}` (400) — membedakan email terdaftar vs belum.
`forgot-password` sengaja menyeragamkan respons (`src/lib/password-reset.ts:49-51,78`).

**Reproduksi:** `POST /api/auth/register` dengan email yang sudah ada → pesan "already exists".
**Dampak:** penemuan akun valid secara andal → memicu phishing & brute force terarah.
**Fix:** respons netral seragam (mis. 200/400 generik) atau alur verifikasi email.

---

## [LOW] Rate limit tujuan webhook dibagi antar tenant

**Severity:** Low · **Labels:** `reliability`, `tenant-isolation`
**Bukti:** `src/lib/webhook-outbox.ts:344-345` — key limiter hanya `hostname`.
**Dampak:** satu tenant membanjiri host penerima bersama → menurunkan delivery tenant lain ke host itu.
**Fix:** masukkan `tenantId` ke key: `webhook-destination:${tenantId}:${hostname}`.

---

## [LOW] Schedule/broadcast retry tanpa attempt cap & tanpa backoff

**Severity:** Low · **Labels:** `bug`, `reliability`
**Bukti:** `src/lib/schedule-queue.ts:232-247` (retryable → clear lock, `nextRunAt` tidak maju),
`src/lib/broadcast-queue.ts:243-260`, `src/lib/message-job-errors.ts:13-29`.
**Dampak:** schedule yang enqueue-nya error generik diklasifikasi retryable → re-claim tiap poll
(~1 dtk) tanpa batas → loop ketat ke WhatsApp & DB (risiko ban).
**Fix:** tambahkan attempt cap + backoff, dan majukan `nextRunAt` pada error generik.

---

## [LOW] `reconcileCampaign` memuat campaign tanpa predikat tenant

**Severity:** Low · **Labels:** `tenant-isolation`
**Bukti:** `src/lib/campaign-queue.ts:206-207` — `findUnique({ where: { id } })` tanpa `tenantId`.
**Dampak:** latent cross-tenant read/write; aman saat ini hanya karena pemanggil internal sistem.
**Fix:** tambahkan `tenantId` ke predikat atau scope eksplisit di pemanggil.

---

## [LOW] Kegagalan webhook/media ditelan `catch {}` tanpa log

**Severity:** Low · **Labels:** `observability`
**Bukti:** `src/lib/webhook.ts:214,328,402`; `src/modules/whatsapp/message-adapter.ts:73`.
**Dampak:** kehilangan event delivery & persistensi media tanpa log/metrik/retry — data loss tak terlihat.
**Fix:** log via `logger.error` (konsisten dengan `dispatchWebhook` `webhook.ts:78-82`).

---

## [LOW] `forgot-password` melaporkan sukses saat email tidak mungkin terkirim

**Severity:** Low · **Labels:** `bug`, `auth`
**Bukti:** `src/lib/password-reset.ts:16-22,69-78` — bila `RESEND_API_KEY`/`PASSWORD_RESET_FROM`
kosong, `sendResetEmail` mengembalikan `false` tapi endpoint tetap `accepted: true`.
**Dampak:** user terkunci tanpa sinyal; operator hanya melihat log server.
**Fix:** bila email tidak dikonfigurasi di produksi, catat sebagai alert operasional (atau gagal jelas).

---

## [LOW] N+1 query per-recipient di loop broadcast

**Severity:** Low · **Labels:** `performance`
**Bukti:** `src/lib/broadcast-queue.ts:151-168` (suppression + consent per recipient),
`:210` (`requireEntitlement` per recipient), plus ~6 query di `enqueueMessage`.
**Dampak:** ~8 round-trip sekuensial per recipient → ≈40k query untuk broadcast 5.000 recipient.
**Fix:** batch prefetch suppression/consent/entitlement per gelombang recipient.

---

## [LOW] TTL idempotency tidak ditegakkan & record kedaluwarsa tidak dipurge

**Severity:** Low · **Labels:** `bug`, `housekeeping`
**Bukti:** `src/lib/message-job-service.ts:87-91` (lookup mengabaikan `expiresAt`),
`:168-176` (menulis `expiresAt` tapi tak ada purge).
**Dampak:** reuse key 7 hari tidak dihormati; tabel tumbuh tanpa batas.
**Fix:** hormati `expiresAt` di lookup; tambahkan purge berkala di maintenance.

---

## [LOW] Counter throttle auto-reply dikonsumsi sebelum enqueue bisa sukses

**Severity:** Low · **Labels:** `bug`
**Bukti:** `src/lib/autoreply-queue.ts:135-138` (update cooldown di dalam transaksi), lalu
`enqueueSnapshot` (`:163-186`) dipanggil di `:220` dan bisa throw.
**Dampak:** enqueue gagal tetap membakar budget rate kontak → balasan sah berikutnya bisa terdrop
(`CONTACT_RATE_LIMITED`).
**Fix:** kompensasi/kembalikan state cooldown bila enqueue gagal.

---

## [LOW] `.env.example` memuat placeholder kredensial admin

**Severity:** Low · **Labels:** `security`, `hardening`
**Bukti:** `.env.example:255-256` (`ADMIN_EMAIL`, `ADMIN_PASSWORD="change-this-in-production"`),
dipakai `start.sh:111-115` & `Dockerfile:41`.
**Dampak:** **Termitigasi** (`scripts/setup-admin.mjs` menolak password lemah → admin tidak dibuat),
tapi placeholder sebaiknya dihapus agar operator tidak tergoda melemahkan policy.
**Fix:** ganti placeholder dengan nilai kosong + komentar instruksi.

---

## [LOW] `X-Powered-By: Next.js` terlepas

**Severity:** Low · **Labels:** `hardening`
**Bukti:** header live `GET /` memuat `X-Powered-By: Next.js`.
**Dampak:** information disclosure ringan (mempermudah penyerang memetakan versi/framework).
**Fix:** set `poweredByHeader: false` di `next.config.mjs`.

---

## [LOW] `/api/health/ready` bocorkan path absolut, kapasitas disk, dan topologi worker

**Severity:** Low · **Labels:** `security`, `information-disclosure`
**Bukti:** response live `GET /api/health/ready` memuat
`"path":"/www/wwwroot/PesanPro/data/private-media"`, `freeBytes`/`totalBytes`, dan daftar
`processes` (8 tipe worker + heartbeat).
**Dampak:** mengungkap layout filesystem server & arsitektur internal ke publik tanpa auth.
**Fix:** publik hanya `status`/`ok` ringkas; detail lengkap di balik auth atau hanya bila
`HEALTH_DETAIL_TOKEN` cocok.

---

## [DEPLOYMENT] `TRUST_PROXY` di belakang nginx belum diverifikasi

**Severity:** Deployment checklist (bukan cacat kode) · **Labels:** `deployment`, `security`
**Bukti:** `src/server/runtime.ts:50-55` + `src/lib/client-ip.ts:43-66`. Default `TRUST_PROXY=false`
→ `getClientIp` memakai alamat socket. Live memakai `Server: nginx` (`/www/wwwroot/...`).
**Dampak bila salah:** semua client tampak sebagai IP proxy → limit per-IP (register 5/jam,
login, API-key IP allowlist) runtuh jadi satu bucket global (self-DoS & kontrol IP tak berguna).
**Reproduksi/verifikasi:** set `TRUST_PROXY=true` + `TRUST_PROXY_HOPS=<jumlah proxy>` di `.env`,
lalu pastikan `recordAudit`/rate-limit mencatat IP client asli (bukan 127.0.0.1).
