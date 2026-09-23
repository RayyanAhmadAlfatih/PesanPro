# PesanPro focused production audit — 2026-09-23

## Scope

This pass audited and fixed the reported billing, segment, scheduler, and auto-reply findings. It also ran the repository's automated regression suite, production build, release preflight, dependency audit, and a targeted secret/log scan.

This report does not claim that the remaining live roadmap phases are complete. WhatsApp delivery, restart/recovery, browser behavior, backup/restore, and production tenant-isolation drills still require the staged/live workflow.

## Findings and resolution

### P0/P1 — Approved payment did not activate the selected plan

**Root cause:** the admin review endpoint only updated `PaymentVerification.status`. It never wrote `Subscription`, so the billing summary correctly continued to return `TRIAL`.

**Fix:** an `APPROVED` review now claims the pending proof and atomically:

- activates the selected plan with `ACTIVE` status for one monthly billing period;
- clears trial/grace state;
- records `SubscriptionHistory` with the payment verification ID;
- synchronizes the legacy device limit;
- returns the activated subscription in the response and audit metadata.

Rejected/cancelled proofs never change the subscription. A proof can only be reviewed once. Submitted amounts must exactly match the selected active plan price.

### P1 — Segment accepted stale or cross-tenant contact tag IDs

**Root cause:** contact tag ownership was checked during preview/evaluation, but not during create/update.

**Fix:** segment create and update now validate every contact tag against the resolved tenant before persistence. The Campaign UI now loads tenant-owned tags and device-owned WhatsApp labels as selectors instead of accepting raw IDs.

### P1 — Auto-reply trigger log privacy and retention

**Root cause:** skipped triggers retained raw `sourceText` and `senderJid`; the UI returned them as stored; operational maintenance had no auto-reply retention rule.

**Fix:**

- terminal `SKIPPED` rows immediately clear `sourceText` and replace `senderJid` with `[redacted]`;
- non-skipped sender JIDs are masked before being returned to the dashboard;
- terminal `ENQUEUED`, `SKIPPED`, and `FAILED` rows are purged daily after `AUTOREPLY_TRIGGER_LOG_RETENTION_DAYS` (default 30 days);
- pending/processing work is never removed by retention.

### P2 — Scheduler forced an isolated dark theme

Hard-coded `slate-950/900` surfaces and inputs were replaced with the existing semantic dashboard tokens. Loading, empty, error, and destructive states now follow the shared theme in both light and dark modes.

### P1 — Hard-coded privileged test credentials and live mutating target

**Root cause:** manual scripts contained a known SUPERADMIN password/API key, printed the key, and defaulted mutating requests to the live domain.

**Fix:** test user setup now refuses production, requires all credentials through environment variables, enforces a stronger test password, and does not log the key. Endpoint tests default to localhost, require an explicit mutating-test acknowledgement, and hide the credential.

### Dependency security

`sharp` was upgraded from `0.35.3` to `0.35.4` to resolve the high-severity libheif advisories reported by `npm audit`.

## Verification evidence

- Automated tests: 65 files / 240 tests passed.
- TypeScript: `tsc --noEmit` passed.
- ESLint: 0 errors; 66 pre-existing warnings remain outside this patch's scope.
- Next.js production build: passed; `/dashboard/developer` is included in the route manifest.
- Production dependency audit after upgrade: 0 vulnerabilities.
- Release preflight: passed with 0 errors and 0 warnings when invoked without the restricted `tsx` IPC wrapper.
- Patch hygiene: `git diff --check` passed.

## Remaining release gates

Continue the supplied live roadmap phase by phase. In particular, do not declare public production readiness until tenant-isolation/IDOR regression, actual WhatsApp messaging, controlled worker restarts, queue recovery, webhook replay/retry, quota concurrency, backup/restore, browser/mobile, and secret/log scans pass against staging or production-like infrastructure.
