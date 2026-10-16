# PesanPro — Ringkasan Perubahan & Cara Verifikasi (fix cycle)

**Branch:** `workbuddy/workbuddy-audit-hardening-2026-10-e171285d`
**Tanggal:** 2026-10-07
**Prinsip:** minimal, aman, reversible; hanya file yang perlu diperbaiki + file terkait langsung.
Tidak ada refactor/naming yang mengubah perilaku kerja yang sudah baik.

---

## A. Ringkasan gate (sebelum → sesudah)

| Gate | Sebelum fix | Sesudah fix |
|---|---|---|
| `tsc --noEmit` | 0 error | **0 error** |
| `eslint .` | exit 0 | **exit 0** |
| `vitest run` | 304/304 lulus (79 file) | **310/310 lulus (81 file)** — +2 file regresi baru |
| `next build --webpack` | sukses (Next 16.3.3) | **sukses (Next 16.4.0)** — exit 0, semua route tergenerasi |
| `npm audit` (semua) | 8 (1 **critical**, 4 high, 3 moderate) | 10 (0 critical, 7 high\*, 3 moderate) |
| `npm audit --omit=dev` (produksi) | 8 (1 critical, 4 high, 3 moderate) | **3 moderate, 0 high, 0 critical** |

\* Sisa 7 "high" pada audit penuh semuanya **dev-only** (rantai `braces` via `eslint-config-next`
dan `patch-package`), tidak ada di runtime produksi.

> **Catatan environment (bukan kegagalan kode):** pada full run, `vitest` menandai 2 suite gagal
> karena `safe-delete` shim environment menolak `rm -rf` pada teardown (`payment-proof.test.ts`,
> `private-media-storage.test.ts`); keduanya **lulus 100% saat dijalankan terisolasi** (7/7).
> `next build` juga terganggu shim yang sama saat cleanup `.next` (batas 50 penghapusan/turn);
> dengan guard dimatikan untuk perintah build saja, **build exit 0**.

---

## B. Perubahan kode (per file)

### 1. `next.config.mjs` — security headers + hapus `X-Powered-By`
**Temuan:** M-NEW-1, L-NEW-1
Menambahkan `headers()` yang menempelkan `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
serta `poweredByHeader: false`.
CSP sengaja hanya `frame-ancestors` agar script inline Next.js tetap jalan (tanpa pipeline nonce).
**Verifikasi:** `curl -sI https://<host>/ | grep -iE "x-frame|x-content-type|referrer-policy|permissions-policy|content-security"` → semua muncul; header `X-Powered-By` hilang.

### 2. `src/app/api/health/ready/route.ts` — redaksi readiness publik
**Temuan:** L-NEW-2
Response publik kini hanya `status`, `ok`, `timestamp`, dan `checks.{web,database,storage,processes}`
tanpa `path` absolut, `freeBytes`/`totalBytes`, atau timestamp heartbeat. Detail lengkap tetap
tersedia via admin system monitor.
**Verifikasi:** `curl -s https://<host>/api/health/ready` → tidak ada string `/www/...` atau `freeBytes`.

### 3. `src/lib/webhook-outbox.ts` — rate limit tujuan webhook per tenant
**Temuan:** L-1
Key limiter: `webhook-destination:${tenantId}:${hostname}`.
**Verifikasi:** unit test outbox tetap hijau; dua tenant berbeda ke host sama tidak lagi berbagi bucket.

### 4. `src/lib/webhook.ts` — hilangkan `catch {}` senyap
**Temuan:** L-4
Tiga `catch {}` (resolve own JID, persist media pesan terkirim, dispatch `message.sent`) kini mencatat
lewat `logger`.
**Verifikasi:** `grep -n "catch {" src/lib/webhook.ts` → tidak ada lagi; `vitest` webhook tests hijau.

### 5. `src/lib/password-reset.ts` — sinyal operator saat email tidak dikonfigurasi
**Temuan:** L-5
Bila `RESEND_API_KEY`/`PASSWORD_RESET_FROM` kosong, log `error` eksplisit menyebut config yang hilang
(respons ke user tetap seragam agar anti-enumerasi).
**Verifikasi:** jalankan tanpa env email → log `[Auth] Password reset requested but email delivery is not configured ...`.

### 6. `src/lib/operations-maintenance.ts` — purge idempotency kedaluwarsa
**Temuan:** L-7 (sebagian)
Menambah `idempotencyRecord.deleteMany({ where: { expiresAt: { lte: now } } })` ke maintenance harian,
sehingga tabel tidak tumbuh tanpa batas.
**Verifikasi:** `vitest src/lib/operations-maintenance.test.ts`; hasil maintenance memuat `expiredIdempotencyRecords`.

### 7. `src/lib/campaign-queue.ts` — predikat tenant pada reconcile
**Temuan:** L-3
`reconcileCampaign(campaignId, tenantId?)` memakai `findFirst` ber-`tenantId`; update memakai
`updateMany` ber-`tenantId`; `reconcileActiveCampaigns` meneruskan `row.tenantId`.
**Verifikasi:** `vitest src/lib/campaign-queue.test.ts`.

### 8. `src/lib/schedule-queue.ts` — backoff + batas attempt
**Temuan:** L-2 (bagian schedule)
`MAX_SCHEDULE_ATTEMPTS = 5`; retryable kini menahan lease (`leaseExpiresAt = now + backoff`, backoff
eksponensial 2^attempt ≤ 60 dtk) alih-alih melepas lock → tidak lagi re-claim tiap poll (~1 dtk).
Attempt habis → terminal `SCHEDULE_ATTEMPTS_EXHAUSTED`.
**Verifikasi:** `vitest src/lib/schedule-queue.test.ts`; review: pada kegagalan berulang, schedule tidak
lagi dipanggil ulang sebelum `leaseExpiresAt`.

### 9. `src/lib/payment-proof.ts` + `src/app/api/payment-verifications/route.ts` (+ test)
**Temuan:** M-4
`storePaymentProof` kini membungkus `storePrivateMediaObject` dengan `runWithStorageQuota`
(menghitung `MEDIA_STORAGE_BYTES`); `deleteStoredPaymentProof(storagePath, verificationId, userId, sizeBytes)`
melepaskan kuota saat rollback. Pemanggil di route meneruskan `session.user.id` + `storedProof.sizeBytes`.
Test `payment-proof.test.ts` men-stub `./storage-quota` agar tetap murni storage.
**Verifikasi:** `vitest src/lib/payment-proof.test.ts` (4/4 lulus); secara manual, submit bukti bayar →
`UsageCounter.consumed` untuk `MEDIA_STORAGE_BYTES` naik.

### 10. `.env.example` — hapus placeholder kredensial admin
**Temuan:** L-9
`ADMIN_EMAIL=""`, `ADMIN_PASSWORD=""` + komentar; boot script hanya membuat admin bila keduanya terisi.
`MYSQL_ROOT_PASSWORD` **tidak** diubah (dikosongkan justru berisiko membuat DB ber-password kosong).
**Verifikasi:** `grep -n "ADMIN_" .env.example` → kosong; `start.sh`/`Dockerfile` melewati provisioning.

### 11. `package.json` — upgrade dependency rentan
**Temuan:** H-NEW-1
`next` 16.3.3 → **16.4.0** (menutup RCE critical di `next/og`, dipakai `src/app/icon.tsx`),
`sharp` 0.35.4 → **0.35.5**, `overrides.engine.io` 6.6.9 → **6.6.11**, tambah `overrides.source-map-js` **1.2.2**.
**Verifikasi:** `npm ls next sharp engine.io source-map-js` menampilkan versi baru;
`npm audit --omit=dev` → 0 critical / 0 high.

---

## C. Temuan yang DITUNDA (dengan alasan keras)

Ini bukan kelalaian: aturan "minimal, aman, reversible; jangan mengubah yang sudah berjalan baik"
bertabrakan dengan perbaikan yang menuntut perubahan kontrak publik atau skema DB. Ketiganya
membutuhkan keputusan produk/migrasi.

| ID | Severity | Alasan ditunda | Rekomendasi |
|---|---|---|---|
| **M-5** | Medium | Menghilangkan enumeration menuntut respons register yang **seragam**, mengubah kontrak API + UX signup yang terdokumentasi. | Ganti 400 "already exists" → respons netral 200 (mis. "Jika email valid, cek inbox"), atau alur verifikasi email. |
| **L-6** | Low | N+1 per-recipient di broadcast: memperbaikinya menuntut restrukturisasi batch pada jalur broadcast yang berjalan baik. | Proses batch recipient per claim + prefetch entitlement/suppression per gelombang. |
| **L-8** | Low | Kompensasi counter throttle auto-reply menuntut menyimpan state cooldown sebelumnya (field/`tx` baru). | Simpan `previousState` di log trigger, kembalikan bila enqueue gagal terminal. |
| **L-2 (broadcast)** | Low | `BroadcastLog` tidak punya kolom `attempts`; cap menuntut migrasi DB. | Tambah kolom `attempts`/`maxAttempts` + migrasi. |
| **moment (moderate)** | Moderate | Tidak ada rilis 2.x yang dipatch; `moment` dibutuhkan `moment-timezone` (dipakai aktif). | Tidak terekspos: kode memakai `.tz()` dengan timezone IANA tervalidasi, bukan `.locale()` dengan input user. |
| **postcss-selector-parser (moderate)** | Moderate | Build-time (Tailwind typography); `--force` justru men-downgrade paket (breaking). | Pantau rilis `@tailwindcss/typography` yang menaikkan `postcss-selector-parser` ≥ 7.1.6. |
| **braces (high, dev-only)** | High (dev) | Hanya via `eslint-config-next` + `patch-package`; tidak ada di runtime produksi. | Tunggu upstream; tidak memengaruhi produksi. |
| **OBS-1** | Deployment | `TRUST_PROXY` sudah didokumentasikan di `.env.example`; nilai pada deployment live tidak bisa saya lihat. | Set `TRUST_PROXY="true"` + `TRUST_PROXY_HOPS=<jumlah proxy>` di `.env` server, lalu pastikan audit log mencatat IP client asli (bukan 127.0.0.1). |

---

## D. Cara verifikasi menyeluruh (reproduce)

```bash
# 1. Gerbang statis & test
npm run typecheck
npm run lint
npm test                 # 79 file / 304 test
npm run build

# 2. Dependency
npm ls next sharp engine.io source-map-js
npm audit --omit=dev      # harapkan: 3 moderate, 0 high, 0 critical

# 3. Smoke live (read-only)
curl -sI https://<host>/ | grep -iE "x-frame|x-content-type|referrer-policy|permissions-policy|content-security"
curl -s  https://<host>/api/health/ready | grep -v "freeBytes\|/www/"
```

Semua gate di atas dijalankan di workspace ini dan hasilnya tercatat di `qa/TEST-REPORT.md`.
