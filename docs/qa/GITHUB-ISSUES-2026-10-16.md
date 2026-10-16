# Daftar GitHub Issue — Temuan QA Pre-Launch PesanPro (2026-10-16)

> `gh` CLI tidak tersedia di mesin ini. File ini adalah **template siap-paste** ke
> GitHub (repo: RayyanAhmadAlfatih/PesanPro). Setiap entri: judul, severity, label,
> bukti file:line, reproduksi, dampak, dan rencana perbaikan minimal.
> Urutan prioritas perbaikan: T-1a → T-1 → T-2 → sisanya.

---

## T-1a — `next@16.3.3`: Critical — Remote Code Execution via next/og ImageResponse (+ 6 advisory lain)

- **Severity:** High (advisory npm: **critical**)
- **Label:** `security`, `dependencies`
- **Bukti:** `npm audit` → `next 16.3.3`, fix `16.4.2` (non-breaking, same major).
  Advisory: GHSA-vcvr-r3jv-pc5j (RCE, range >=16.2.0 <16.3.6), GHSA-3w37-wq28-93x7
  (Draft Mode content leak, >=16.3.0 <16.3.8), GHSA-4jqv-mc3x-m676 (cache poisoning
  SSG/ISR self-hosted, >=16.0.0 <16.3.8), GHSA-39w2-rjm5-chcv (dev MCP info
  disclosure), GHSA-f87g-xv8r-7p7x (metadata image route info disclosure),
  GHSA-mcj8-r9mp-w47p (cache poisoning cross-user substitution + persistent DoS),
  GHSA-cjq9-62q9-8jv4 (**SSRF in Image Optimization** — relevan karena app memakai
  `next/image`).
- **Reproduksi:** `npm audit` di root repo → 1 critical, package `next`.
- **Dampak:** potensi RCE di runtime produksi + SSRF image optimization + cache
  poisoning. App sudah live di wagateway.kingofcoding.my.id.
- **Perbaikan:** bump `next` → `^16.4.2` (semver-compatible) + `sharp` → `^0.35.5`
  (GHSA-wq5f-xc86-pv6w, librsvg CVE) + override `engine.io` → `6.6.10`
  (GHSA protokol mismatch DoS), lalu jalankan ulang semua gates + build.
  **Status: SUDAH DIPERBAIKI di branch ini (lihat L6).**

---

## T-1 — Medium: Pesan error internal (Prisma/Baileys) dikembalikan mentah ke klien API

- **Severity:** Medium (information disclosure)
- **Label:** `security`, `bug`
- **File:line:** `src/app/api/messages/[sessionId]/[jid]/send/route.ts:79-80`
- **Bukti:**
  ```ts
  const errorMsg = getErrorMessage(error) || "Failed to send message";
  return NextResponse.json({ status: false, message: errorMsg, error: errorMsg }, { status: 500 });
  ```
  `getErrorMessage` (`src/lib/error-utils.ts:1-7`) mengembalikan `error.message`
  apa adanya. `enqueueMessage` dapat melempar error Prisma (mis.
  ``Invalid `prisma.messageJob.create()` invocation...``), error undici/fetch, dan
  error Baileys — semuanya memuat hostname internal, path, dan detail library.
  Endpoint ini adalah endpoint developer legacy paling panas dan bisa diakses API key.
- **Reproduksi:** `POST /api/messages/{session}/{jid}/send` dengan payload yang
  memicu kegagalan non-`MessageJobError` (mis. DB down sesaat) → body 500 memuat
  pesan error mentah.
- **Dampak:** pengungkapan detail internal ke tenant mana pun yang terautentikasi
  (termasuk pemegang API key) — bahan rekognisi untuk serangan lebih dalam.
- **Perbaikan:** kembalikan pesan generik `"Failed to send message"` (tetap
  pertahankan jalur `commercialErrorResponse`), hapus import `getErrorMessage`
  yang jadi tidak terpakai. **SUDAH DIPERBAIKI (lihat L6).**

---

## T-2 — Medium: `/api/health/ready` membocorkan path disk, kapasitas storage, dan topologi worker ke publik

- **Severity:** Medium (information disclosure)
- **Label:** `security`
- **File:line:** `src/app/api/health/ready/route.ts:9` (menyebar seluruh snapshot);
  sumber data `src/lib/operations.ts:43-49` (`path`, `freeBytes`, `totalBytes`) dan
  `:278` (`processes[]`); eksposur publik di `src/proxy.ts:15-20` (whitelist anonim).
- **Bukti (live, terverifikasi):**
  ```json
  {"status":"ok","check":"readiness","ok":true,...,"checks":{
    "storage":{"ok":true,"path":"/www/wwwroot/PesanPro/data/private-media",
               "freeBytes":"27912798208","totalBytes":"63290032128"},
    "processes":[{"processType":"WEB",...},{"processType":"MESSAGE_WORKER",...}, ...]}}
  ```
- **Reproduksi:** `curl https://wagateway.kingofcoding.my.id/api/health/ready`
  (tanpa auth) → body memuat path absolut, kapasitas disk, dan nama proses worker.
- **Dampak:** pengintaian infrastruktur untuk penyerang tak terautentikasi
  (path file → target traversal/upload; topologi → permukaan serangan worker).
  Tidak membocorkan kredensial/env.
- **Perbaikan:** route `/api/health/ready` mengembalikan payload minimal
  (`status`, `ok`, `timestamp`) saja; snapshot lengkap tetap tersedia untuk
  konsumen internal/session (`/api/health` sudah session-gated).
  **SUDAH DIPERBAIKI (lihat L6).**

---

## T-3 — Low: `retryMessageJob` membocorkan reservasi kuota saat race/DB error

- **Severity:** Low (kebenaran billing/kuota)
- **Label:** `bug`, `billing`
- **File:line:** `src/lib/message-job-service.ts:243-270`
- **Bukti:** `reserveUsage(...)` dipanggil **sebelum** `updateMany` kondisional;
  bila `updated.count === 0` (job keluar dari FAILED karena race) atau DB melempar,
  `MessageJobStateError` dilempar tanpa `releaseReservedUsage` — reservasi
  `message-retry:<hash>` menggantung permanen dan ikut dihitung di limit
  (`storage-quota.ts`).
- **Reproduksi:** dua `POST /api/v1/messages/{id}/retry` paralel saat job berubah
  state; yang kalah melempar 409 dan reservasinya orphan. Diulang → kuota
  MESSAGES_MONTHLY habis.
- **Dampak:** tenant kehilangan kuota permanen akibat race/error transien
  (self-inflicted, tanpa efek lintas tenant).
- **Perbaikan:** bungkus reserve+update dalam try/catch; pada kegagalan
  `updateMany`/exception, panggil `releaseReservedUsage` dengan key yang sama
  (pola sudah dipakai benar di `enqueueMessage` :180-190). **SUDAH DIPERBAIKI.**

---

## T-4 — Low: API key valid tapi scope kurang → diam-diam fallback ke session auth

- **Severity:** Low (defense-in-depth)
- **Label:** `security`
- **File:line:** `src/lib/api-auth.ts:104-111`
- **Bukti:** bila `apiKeyUser` ada tapi scope tidak cocok, fungsi **tidak gagal** —
  lanjut ke session auth. Kombinasi (x-api-key tanpa scope + cookie sesi valid)
  akan terautentikasi sebagai user sesi (privilege penuh).
- **Reproduksi:** `POST /api/v1/messages/text` dengan `x-api-key` (tanpa
  `message:send`) **dan** cookie sesi valid, dengan edge di-bypass.
- **Dampak:** hari ini tertutup oleh `proxy.ts:76-79` (403 SCOPE_FORBIDDEN di edge
  untuk semua path ber-scope). Menjadi masalah hanya jika matcher proxy berubah
  atau route dipanggil melewati edge.
- **Perbaikan:** bila `apiKeyUser` ada dan scope yang diminta tidak termasuk →
  `return null` (401) alih-alih jatuh ke session auth. **SUDAH DIPERBAIKI.**

---

## T-5 — Low: URL media remote divalidasi saat enqueue, di-fetch ulang tanpa re-validasi (TOCTOU/DNS rebinding)

- **Severity:** Low (SSRF berbasis waktu)
- **Label:** `security`
- **File:line:** validasi di `src/lib/message-job-service.ts:110`
  (`validateRemoteMediaUrl`); fetch kemudian di `src/modules/whatsapp/message-adapter.ts:23`
  (Baileys mengunduh URL tersimpan tanpa validasi ulang).
- **Reproduksi:** enqueue `imageUrl` publik (DNS publik di T0), ubah A record ke
  `10.0.0.5` di T0+60s; saat worker mengambil job QUEUED, fetch mengarah ke
  jaringan internal.
- **Dampak:** jendela SSRF sempit (job bisa mengantre menit-menitan); mitigasi
  existing: hanya port 80/443, private-range diblokir saat enqueue, fetch terjadi
  oleh Baileys di host gateway.
- **Perbaikan:** jalankan ulang `validatePublicUrl` tepat sebelum fetch di jalur
  dispatch. **SUDAH DIPERBAIKI.**

---

## T-6 — Low: Traffic `/api/v1` ber-session melewati edge rate limiter

- **Severity:** Low (availability)
- **Label:** `bug`
- **File:line:** `src/proxy.ts:56-128` — rate limit `developer-api` hanya berlaku
  bila header `x-api-key` ada; pemanggil dashboard (cookie) tidak dibatasi.
- **Reproduksi:** dengan cookie sesi, loop `POST /api/v1/broadcasts/recipients/import`
  (parse CSV 2 MB) → tidak ada 429.
- **Dampak:** tenant terautentikasi dapat membebani endpoint parse mahal; bukan
  lintas-tenant; dibatasi kuota per-fitur.
- **Perbaikan:** tambahkan rate limit sesi (300/menit, selaras default API key)
  di cabang session proxy. **SUDAH DIPERBAIKI.**

---

## T-7 — Low: Field tak terbatas pada route legacy poll/contact/list/forward

- **Severity:** Low (abuse/DoS)
- **Label:** `bug`
- **File:line:** `src/app/api/messages/[sessionId]/[jid]/poll/route.ts:23-36`,
  `contact/route.ts:21-36`, `list/route.ts:22-29`, `forward/route.ts:21-55`
  (terutama: **tanpa batas `toJids.length`** → satu request bisa fan-out ribuan
  `sendMessage`; broadcast membatasi 5000, route ini tidak).
- **Reproduksi:** `POST .../forward` dengan `toJids` 50.000 entri → satu HTTP
  request memicu 50.000 pengiriman keluar.
- **Dampak:** penyalahgunaan kuota + tekanan memori; kuota per-pesan tetap berlaku
  tapi tidak ada batas per-request.
- **Perbaikan:** batas eksplisit (toJids ≤ 100, contacts ≤ 10, options ≤ 10,
  panjang teks terjaga) mengikuti gaya validasi ad-hoc yang sudah ada di route.
  **SUDAH DIPERBAIKI.**

---

## T-8 — Low: `?limit=abc` → NaN sampai ke Prisma → 500

- **Severity:** Low (robustness)
- **Label:** `bug`
- **File:line:** `src/app/api/webhooks/[sessionId]/[id]/logs/route.ts:17`
  (dan pola sama di `messages/[sessionId]/broadcast/history/route.ts`).
- **Bukti:** `Number("abc" || 50)` → `NaN`; clamp service `Math.min(200,
  Math.max(1, input.limit ?? 50))` tidak menangkap `NaN` (`??` hanya menangkap
  null/undefined) → `take: NaN` ke Prisma → error validasi → 500 generik.
- **Reproduksi:** `GET /api/webhooks/{s}/{id}/logs?limit=abc` → 500.
- **Dampak:** respons salah status; tanpa kebocoran data.
- **Perbaikan:** parse dengan fallback aman (`Number.isFinite` check).
  **SUDAH DIPERBAIKI.**

---

## T-9 — Low: Body non-JSON pada webhook create/update → 500 (bukan 400)

- **Severity:** Low (kontrak API)
- **Label:** `bug`
- **File:line:** `src/app/api/webhooks/[sessionId]/route.ts:49`,
  `src/app/api/webhooks/[sessionId]/[id]/route.ts:36`
- **Bukti:** `createSchema.parse(await request.json())` melempar `SyntaxError`
  (bukan `ZodError`) pada JSON rusak → jatuh ke catch generik → 500.
- **Reproduksi:** `POST /api/webhooks/{s}` body `not-json` → 500, seharusnya 400/422.
- **Dampak:** UX klien membingungkan; tanpa dampak keamanan.
- **Perbaikan:** bungkus `request.json()` dengan try/catch → 400. **SUDAH DIPERBAIKI.**

---

## T-10 — Low: User tidak ada → 500 (PATCH/DELETE), JSON rusak → 500 (settings), BigInt overflow → 500 (entitlement)

- **Severity:** Low (robustness)
- **Label:** `bug`
- **File:line:** `src/app/api/users/[id]/route.ts:59-71,117-120` (P2025 → 500);
  `src/app/api/settings/system/route.ts:39` (`await req.json()` tanpa
  `.catch(() => null)`); `src/app/api/admin/entitlement-overrides/[userId]/route.ts:18`
  (`limit: z.string().regex(/^\d+$/)` tanpa batas panjang → `BigInt()` overflow
  MySQL → 500).
- **Reproduksi:** sebagai SUPERADMIN: `PATCH /api/users/nonexistent` → 500 (seharusnya
  404); `POST /api/settings/system` body `{bad` → 500 (seharusnya 400);
  `PUT /api/admin/entitlement-overrides/{uid}` `limit:"9".repeat(40)` → 500.
- **Dampak:** metrik error terpolusi; tanpa kebocoran data.
- **Perbaikan:** cek eksistensi → 404; `.catch(() => null)` → 400; batasi panjang
  digit limit (≤ 18). **SUDAH DIPERBAIKI.**

---

## T-11 — Low: Register membocorkan keberadaan akun

- **Severity:** Low (enumeration)
- **Label:** `security`
- **File:line:** `src/app/api/auth/register/route.ts:45-50` — respons 400 khusus
  "User with this email already exists".
- **Dampak:** enumerasi email terdaftar (5/jam/IP; rotasi IP mem-bypass).
  **Saat ini tidak dieksploitasi karena registrasi dimatikan di live** ("Registration
  is currently disabled by the administrator"), tapi akan aktif begitu setting
  dihidupkan.
- **Perbaikan:** kembalikan pesan validasi generik yang sama untuk email sudah ada.
  **SUDAH DIPERBAIKI.**

---

## T-12 — Low: Forgot-password tanpa throttle per-email

- **Severity:** Low (abuse)
- **Label:** `security`, `bug`
- **File:line:** `src/app/api/auth/forgot-password/route.ts:13` — rate limit hanya
  per-IP (`password-reset-request:${ip}`, 5/jam); OTP punya limiter per-email,
  reset password tidak.
- **Reproduksi:** dari N IP berbeda, spam `POST /api/auth/forgot-password`
  `{"email":"victim@x"}` → korban kebanjiran email reset **dan** setiap permintaan
  menghapus token reset lama yang belum terpakai (`password-reset.ts:82-89`).
- **Dampak:** email-bomb + pengusiran token korban.
- **Perbaikan:** tambah limiter `password-reset-request:email:{email}` 3/15 menit
  (pola sama seperti OTP). **SUDAH DIPERBAIKI.**

---

## T-13 — Low: Cast `formData.get("file")` tanpa instanceof → 500

- **Severity:** Low (robustness)
- **Label:** `bug`
- **File:line:** `src/app/api/messages/[sessionId]/[jid]/media/route.ts:20`
- **Reproduksi:** kirim field teks bernama `file` → `file.arrayBuffer is not a
  function` → 500 generik.
- **Dampak:** status salah; validasi hilir (`storePrivateMedia`) tetap solid.
- **Perbaikan:** cek `instanceof File` → 400. **SUDAH DIPERBAIKI.**

---

## T-14 — Low: `notifications/read` ids tidak divalidasi

- **Severity:** Low (robustness)
- **Label:** `bug`
- **File:line:** `src/app/api/notifications/read/route.ts:11-13` — array `ids`
  tanpa zod; elemen non-string → 500 generik; array besar → query membengkak.
- **Perbaikan:** validasi `ids` (array string, batas panjang). **SUDAH DIPERBAIKI.**

---

## T-15 — Low: Variabel `io` tak terpakai (lint warning)

- **Severity:** Low (kebersihan)
- **Label:** `cleanup`
- **File:line:** `src/modules/whatsapp/store/index.ts:275` — `'io' is defined but
  never used` (`@typescript-eslint/no-unused-vars`).
- **Perbaikan:** hapus deklarasi/parameter yang tak terpakai. **SUDAH DIPERBAIKI.**

---

## T-16 — Low: Header `X-Powered-By: Next.js` terekspos

- **Severity:** Low (information disclosure minimal)
- **Label:** `security`
- **File:line:** respons HTTP live (root) — header bawaan Next.js.
- **Perbaikan:** `poweredByHeader: false` di `next.config.mjs`. **SUDAH DIPERBAIKI.**

---

## T-17 — Info: perbandingan secret panjang-tidak-sama (timing side-channel negligible)

- **Severity:** Info
- **Label:** `security`
- **File:line:** `src/app/api/internal/message-dispatch/route.ts:10-14` —
  `left.length === right.length && timingSafeEqual(...)`: `timingSafeEqual`
  memang mewajibkan panjang sama, guard fungsional diperlukan. Panjang secret env
  (≥32 char) bukan rahasia. **Tidak wajib diperbaiki**; disarankan hash kedua sisi
  jika ingin menghilangkan cabang sepenuhnya.

---

## Catatan non-temuan (diverifikasi aman, tidak jadi issue)

- Route `messages/[sessionId]/download/[messageId]/media` → 410 Gone (retired,
  sesuai desain produk).
- `canAccessSession` menerima cuid atau public `sessionId`; lookup hilir memakai
  `sessionId` — cuid menghasilkan 404 membingungkan (kosmetik, fail-closed).
- `visibleTenantWhere(actor, tenantId)` mengabaikan parameter `actor` (dead code,
  bukan celah).
- API key legacy mendapat `DEFAULT_API_KEY_SCOPES` (semua scope) — shim migrasi
  yang terdokumentasi; kunci baru wajib scope eksplisit.
- `/api/internal/*` sengaja melewati proxy (machine-only, constant-time secret
  dari env, fail-closed saat unset).
