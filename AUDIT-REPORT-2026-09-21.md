# PesanPro Source Audit & Hardening Report — 2026-09-21

## Scope
Audit release-candidate source PesanPro 0.1.0 with focus on SaaS tenant isolation, durable messaging/idempotency, integration credentials, Google Forms, Contact Form 7, private media boundaries, release hygiene, and regression safety.

## Changes applied

### P0/P1 — Integration processing crash recovery
- Added `IntegrationUsageLog.updatedAt` and a forward-only Prisma migration.
- Added stale `PROCESSING` recovery after 5 minutes.
- Prevents an idempotent integration request from becoming permanently stuck after a process crash between usage-log creation and durable MessageJob creation.

### P0/P1 — Integration credential tenant binding
- Integration token creation now verifies that the selected WhatsApp session belongs to the same tenant as the credential.
- Prevents SUPERADMIN's global session visibility from accidentally creating a cross-tenant integration credential/session binding.

### P1 — CF7 stable idempotency identity
- CF7 connector now uses Contact Form 7's `get_posted_data_hash()` as the stable submission identity when available.
- Added a deterministic fallback based on form ID, submission timestamp and normalized fields.
- Prevents duplicate WhatsApp jobs if the same CF7 submission hook is delivered more than once.

### P1 — CF7 cron spin / stale claim scheduling
- Queue scheduler now schedules pending/retry rows by `available_at` and processing rows by `locked_at + 5 minutes`.
- Prevents immediate cron rescheduling loops while another worker still owns a processing row.

### P2 — CF7 settings UI
- Fixed unreachable helper text for Form ID (`0 = all forms`).

### Release hygiene
- Removed runtime `.env` from the distributable artifact.
- Removed PM2 runtime logs from the distributable artifact.
- Removed runtime WhatsApp/media payloads from `data/media`, `data/private-media`, and `public/media`; only `.gitkeep` placeholders remain.
- Removed temporary/backup development files found in source (`src/fix_test.js`, `page.tsx.backup-r3`).
- `.env.example` remains included.

## Integration status

### Google Forms
Included connector:
- installable form-submit trigger;
- token stored in Script Properties;
- HTTPS-only PesanPro endpoint;
- stable SHA-256 idempotency key;
- bounded retry for transient HTTP/network failures;
- no browser-side token exposure.

### Contact Form 7
Included WordPress plugin:
- server-side `wpcf7_mail_sent` integration;
- integration token kept server-side (option or recommended wp-config constant);
- durable local DB queue;
- claim token / stale lock recovery;
- bounded exponential retry;
- stable idempotency key;
- retention cleanup;
- Site Health configuration check.

## Verification performed
- PHP syntax validation: PASS for all CF7 plugin PHP files.
- `npm run test:wordpress-plugin`: PASS.
- Static source review of integration API, token handling, idempotency flow, media tenant filtering, API auth/scope path, queue patterns, raw SQL usage, child-process usage, release artifacts and credential-like literals.
- Google Apps Script UrlFetch options cross-checked against current Google documentation.
- CF7 submission API/hash usage cross-checked against Contact Form 7 upstream documentation/source.

## Verification limitation
A clean Node dependency installation could not complete within the execution environment's command transport window. Therefore the final artifact is **not claimed** to have a fresh full `npm run typecheck`, `npm test`, `npm run lint`, or `npm run build` pass in this audit environment. The first attempted typecheck occurred before dependencies were installed and failed because packages/types such as Next.js, Node types, Prisma and Socket.IO were unavailable; Vitest/ESLint binaries were likewise missing.

Before production deployment, run from a clean host/CI:

```bash
npm ci
npx prisma generate
npm run typecheck
npm test
npm run test:wordpress-plugin
npm run lint
npm run build
npm run release:preflight
```

Then apply migrations using the project's normal deployment path (`prisma migrate deploy`) before starting the new application code.

## Remaining production gates
This audit materially hardens the supplied snapshot, but no source audit alone should be treated as proof that a WhatsApp gateway is 100% production-safe. Keep the PRD release gates: production-like E2E with real test device, controlled restart with queued work, backup/restore drill, webhook retry/replay, rate/quota concurrency, tenant-isolation regression tests, and secret/log scanning in CI.
