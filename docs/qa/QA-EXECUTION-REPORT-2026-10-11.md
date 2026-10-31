# QA Execution Report — PesanPro pre-launch (2026-10-11)

- Target: branch `workbuddy-audit-privacy-branding-2026-10-11`, HEAD `c6fbc9a`.
- Environment: Windows, Node 22.22.2, tanpa `.env`, tanpa MySQL, `next dev` tidak bisa boot (crash EPERM). Karena itu lapisan otomatis berjalan penuh; lapisan manual/E2E sebagian besar BLOCKED.
- Test plan: `docs/qa/QA-TEST-PLAN-2026-10-11.md`.

## Ringkasan lapisan

| Lapisan | PASS | FAIL | PARTIAL | BLOCKED | NOT TESTED |
|---|---|---|---|---|---|
| Baseline | 1 | 0 | 0 | 0 | 0 |
| Otomatis (unit/integration + verifikasi statik) | 34 | 2 | 1 | 0 | 0 |
| Manual (butuh runtime WA/DB/HTTP) | 0 | 0 | 1 | 17 | 0 |
| Ditunda | 0 | 0 | 0 | 0 | 0 |

Temuan: **2 FAIL (BUG-01, BUG-02)** dan **1 temuan reliability (BUG-03, flaky suite)**.

---

## Lapisan 1 — Baseline

**TC-000 — PASS (dengan catatan flaky).**
Bukti: `npm test` (`vitest run --maxWorkers=1`).
- Run 1: `Test Files 80 passed (81)` · `Tests 311 passed (315)` · `Errors 1` · `Worker exited unexpectedly`. 1 berkas + 4 test tidak pernah dieksekusi.
- Run 2 (idle): `Test Files 81 passed (81)` · `Tests 315 passed (315)` · `EXIT=0`.

Klaim "315/315" **terbukti pada run bersih**, tetapi tidak deterministik. Detail di BUG-03.

---

## Lapisan 2 — Otomatis

### REQ-11 — Auth & tenant isolation

- **TC-001 PASS** — `src/lib/api-auth.tenant.test.ts:32-42`. `canAccessSession` memfilter `where.userId`; device tenant lain → `false`.
- **TC-002 PASS** — `api-auth.tenant.test.ts:60-68`. SUPERADMIN tidak dapat akses device pelanggan; hanya device miliknya sendiri (`:50-58`).
- **TC-003 PASS** — `api-auth.tenant.test.ts:44-48`. Status SUSPENDED → `false` sebelum `session.findFirst` dipanggil.
- **TC-004 PASS** — verifikasi statik: `canAccessSession` dipanggil di `src/lib/{webhook-service,schedule-service,broadcast-service,autoreply-service,campaign-service,integration-service,private-media,message-job-service,segment-service}.ts`. `webhook-service.ts:81-88` (`accessibleSession`) dan `private-media.ts:53-62` men-scope ke `tenantId`/`userId`.
- **TC-005 BLOCKED** — butuh runtime untuk membuktikan route terhapus balas 404. Verifikasi statik: folder route tidak ada (lihat TC-045/046), sehingga Next.js otomatis 404.

### REQ-12 — Kirim pesan & broadcast

- **TC-007 PASS** — `src/lib/message-job-service.ts:131-135`. Key + payload sama → `{ idempotent: true }` (200).
- **TC-008 PASS** — `message-job-service.ts:133`. Hash beda → `IdempotencyConflictError` (409).
- **TC-009 PASS** — `src/lib/api-v1.ts:39-45`. Wajib 8-128 char, regex `^[A-Za-z0-9._:-]+$`; gagal → 422.
- **TC-012 PASS** — `src/lib/usage.ts:145-147` & `:196-198`. `consumed + reserved + amount > limit` → `QuotaExceededError` → `apiV1Exception` 429.
- **TC-013 PASS** — `message-job-service.ts:221-229`. Cancel hanya status `QUEUED`; selain itu `MessageJobStateError`.
- **TC-006 / TC-010 / TC-011 BLOCKED** — butuh runtime Baileys + nomor WA nyata.

### REQ-13 — Signature webhook

- **TC-014 PASS** — `src/lib/webhook-contract.ts:38-40` + `webhook-contract.test.ts`.
- **TC-015 PASS** — `webhook-contract.ts:79-81` `safeEqualHex` (timing-safe) + test.
- **TC-016 PASS** — `webhook-contract.ts:76-78` toleransi 300s → `STALE_TIMESTAMP`.
- **TC-017 PASS** — `webhook-contract.ts:82` `isReplay` → `REPLAY_DETECTED`.
- **TC-018 PASS** — `webhook-contract.ts:69` → `MISSING_HEADERS`.
- **TC-019 PASS** — `src/lib/ssrf.ts` (`isPrivateIP` IPv4+IPv6 lengkap) & `src/lib/webhook-transport.ts:66-85`. `ssrf.test.ts` (9 test) + `webhook-transport.test.ts` (10 test) lulus.
- **TC-020 PASS** — `webhook-crypto.ts:58-71` (`decryptPreviousWebhookSecret`, hanya valid sampai `previousSecretExpiresAt`).

### REQ-04 — Message.content tidak ditulis

- **TC-021 PASS** — `src/modules/whatsapp/store/index.ts:453-471`. `prisma.message.create` tidak memuat field `content`; ada komentar eksplisit "Message text is never persisted".
- **TC-022 PASS** — verifikasi statik: tidak ada penulis `content` di jalur runtime (kemunculan `content:` hanya di `schedule-service.ts` untuk `ScheduledMessage` dan `webhook.ts` untuk payload keluar, bukan `Message`).
- **TC-023 PASS** — `store/index.ts:548-556`. Auto-reply menerima `text` hidup via `ingestAutoReplyMessage`, bukan membaca baris DB.

### REQ-07 — Retensi & purge

- **TC-024 PASS** — `operations-maintenance.test.ts:20` → `messageBefore` null saat `0`.
- **TC-025 PASS** — `operations-maintenance.test.ts:21` → `=30` menghasilkan `now-30d`.
- **TC-026 PASS (inspection)** — `operations-maintenance.ts:22` rumus linear `messageRetentionDays * DAY_MS`; `31` menghasilkan `now-31d`. Test langsung untuk `31` belum ada (gap kecil).
- **TC-027 PASS** — `operations-maintenance.ts:29-54`: hanya purge `auditLog`, `runtimeHeartbeat`, `operationalAlert`, `autoReplyTriggerLog`, `tenantEntitlementOverride`, `rateLimitBucket`, private media, `message`, QR sesi. Tidak ada `contact`/`group`.
- **TC-028 PASS** — `operations-maintenance.test.ts:13` + `operations-maintenance.ts:12` (`QR_STALE_MS = 60*60*1000`).
- **TC-029 PASS** — `src/lib/env.ts:78` `min(0).max(3650).default(30)`.

### REQ-08 — Welcome sekali kirim

- **TC-035 PASS (statik)** — `store/index.ts:526-533`: `welcomedAt` ditandai (`update`) **sebelum** `sendMessage`; cabang butuh baris `Contact`.
- **TC-030..034 BLOCKED** — butuh runtime WA + MySQL (dan `prisma migrate deploy` untuk TC-034).

### REQ-09 — API key scope

- **TC-036 PASS** — `src/app/dashboard/developer/page.tsx:44` `useState<string[]>([])`; tombol Create `disabled` saat `selectedScopes.length === 0` (`:123`).
- **TC-037 PASS** — `developer/page.tsx:19-23` tiga preset: "Kirim pesan", "Kirim + terima event", "Baca saja".
- **TC-038 PASS** — `src/app/api/user/api-keys/route.ts:17` `scopes ... .min(1)`; UI memblokir submit kosong.
- **TC-039 PASS** — `api-scope-policy.ts` + `canUseApiScope` (`api-auth.ts:73-78`); scope parsial hanya meloloskan scope yang dimiliki.
- **TC-040 PASS** — `api-key-service.ts:37-41` `parseApiKeyScopes` whitelist; scope penuh meloloskan semua.
- **TC-041 FAIL → BUG-02** — `route.ts:17` `.optional()` + `api-key-service.ts:28,113` (`DEFAULT_API_KEY_SCOPES = [...API_KEY_SCOPES]`). POST tanpa `scopes` menghasilkan key 16-scope. Melanggar least-privilege / REQ-09.

### REQ-01 / 02 / 03 / 05 — Permukaan dipensiunkan

- **TC-042 PASS** — verifikasi statik: `downloadAndSaveMedia` hanya tersisa di 2 berkas test yang justru menguji ketiadaannya (`media-download-retirement.test.ts`, `whatsapp-sync-minimization.test.ts`).
- **TC-045 PASS** — verifikasi statik: tidak ada `src/app/**/contacts*` maupun `contact-tags`.
- **TC-046 PASS** — verifikasi statik: tidak ada route `search`; `chat.service.ts` tidak ada.
- **TC-044 PARTIAL** — `src/app/api/v1/media/route.ts` ada (GET list, POST upload) dan memanggil `storePrivateMedia` (tenant-scoped); eksekusi upload nyata BLOCKED (butuh runtime + kredensial B2).
- **TC-043 BLOCKED** — butuh runtime untuk HTTP 404.

### REQ-06 / 10 — Webhook forward & privasi log

- **TC-048 PASS** — `operations-maintenance.test.ts:25` (`628••••789@s.whatsapp.net`); `jid-utils.ts:3,76` memakai `maskJid`.
- **TC-049 PASS** — `operations-maintenance.ts:47-53` + test (`:13`).
- **TC-047 BLOCKED** — butuh endpoint webhook tenant nyata.

### REQ-14 / 15 / 16 — Media B2, billing, reset password

- **TC-051 PASS** — `private-media.ts:111-115`: checksum/size mismatch → status `QUARANTINED` + `MEDIA_INTEGRITY_FAILED`. `private-media.test.ts` lulus.
- **TC-052 PASS** — `private-media-storage.ts:28-34` `normalizeStoragePath` menolak `..`/kosong; `:40-47` memastikan hasil resolve di dalam root.
- **TC-053 PASS** — `usage.ts:145-147` (COMMIT) & `:196-198` (RESERVE).
- **TC-054 PASS** — `billing.test.ts` (7 test) + `billing.ts:120-122` (`GRACE_RESTRICTED_FEATURES`).
- **TC-055 PASS** — `usage.ts:129-141` & `:230-240`: ledger idempotency mencegah kuota dobel.
- **TC-057 PASS** — `password-reset.ts:118-133`: `updateMany` sekali-pakai, TTL 30 menit, `sessionVersion` naik. `password-policy.test.ts` lulus.
- **TC-058 PASS** — `forgot-password/route.ts:35-38`: respons generik.
- **TC-059 PASS** — `forgot-password/route.ts:13` (5/jam), `reset-password/route.ts:15` (10/15m).
- **TC-050 BLOCKED** — butuh B2 nyata.
- **TC-056 FAIL → BUG-01** — `password-reset.ts:16-40` mengirim lewat HTTP API Resend (`api.resend.com`), bukan SMTP. Jalur SMTP (`email-transport.ts:34`) hanya dipakai `email-outbox.ts:74`.

---

## Lapisan 3 — Manual

Hampir seluruh lapisan manual **BLOCKED**: tidak ada `.env`, tidak ada MySQL, dan `next dev` tidak bisa boot (dicatat di memori kerja 2026-10-11, `EPERM` pada `.next/dev/types`). Tanpa runtime, tidak ada satu pun skenario end-to-end (kirim WA nyata, delivered/read, webhook ke endpoint tenant, upload B2 nyata, SMTP nyata, migrasi ke MySQL nyata) yang dapat dieksekusi.

Rekomendasi eksekusi di lingkungan staging (bukan VPS produksi):
1. Siapkan `.env` staging (MySQL, `ENCRYPTION_KEY`, `AUTH_SECRET`, `BASE_URL`).
2. `npx prisma migrate deploy` lalu `npm run start`.
3. Jalankan TC-005/006/010/011/030-034/043/047/050/056 berurutan dengan 2 tenant uji.

## Lapisan 4 — Ditunda

Tidak ada test yang sengaja ditunda; yang tersisa adalah BLOCKED karena keterbatasan environment.

---

## Temuan

| ID | REQ | Severity | Ringkasan |
|---|---|---|---|
| BUG-01 | REQ-16 | Medium | Reset password pakai Resend HTTP API, bukan SMTP; gagal senyap bila hanya SMTP dikonfigurasi |
| BUG-02 | REQ-09 | Medium | Endpoint buat API key menerima `scopes` kosong → key 16-scope (langgar least privilege) |
| BUG-03 | (baseline) | Low | Suite test flaky: 1 dari 2 run mengalami worker crash |

Detail lengkap + langkah reproduksi + dampak ada di `docs/qa/issues/`.

## Verifikasi 4 temuan P1 lama (tidak dilaporkan ulang)

| P1 lama | Status di branch ini | Bukti |
|---|---|---|
| SSRF download media webhook | Sudah fix | `downloadAndSaveMedia` absen (TC-042); `ssrf.ts` + `webhook-transport.ts:66-85` blokir IP privat; `ssrf.test.ts` lulus |
| Fallback API key plaintext | Sudah fix | `api-key-auth.ts:50-63` migrasi plaintext → hash saat pertama dipakai |
| Hapus label lintas tenant | Sudah fix | Route/file label hilang (hanya `components/ui/label.tsx` tersisa, komponen UI) |
| Session timeout tak terpakai | Sudah fix | `sessionVersion` ditegakkan di `auth.config.ts:34`, `api-auth.ts:122`, `server-action-auth.ts:20`, `socket.ts:67` |

## Gates yang dijalankan

| Gate | Hasil |
|---|---|
| `npm test` | 315/315 lulus (run bersih); flaky (BUG-03) |
| Verifikasi statik REQ-01/03/04/05/07/09 | Lulus kecuali TC-041 |
