# PesanPro QA Automation — L0 to L2

This is the first automation layer for `ROADMAP-LIVE-TEST.md`. The roadmap explicitly says to move phase-by-phase, starting at L0 → L1 → L2, and treats every cross-tenant IDOR as a P0 blocker.

## Commands

```bash
npm run qa:l1
npm run qa:l2
npm run qa:automated:l0-l2
PESANPRO_QA_BASE_URL=https://wagateway.kingofcoding.my.id npm run qa:live:l0
```

## L0 — Production/Deployment Sanity

Automated live probes:
- L0-01 domain HTTP response
- L0-02 HTTPS/TLS plus obvious insecure `http://` asset references
- L0-03 `/api/health/live`
- L0-04 `/api/health/ready`
- L0-05 `/api/health` when accessible; protected responses are reported as NEEDS_EVIDENCE instead of false PASS
- L0-13 Terms
- L0-14 Privacy
- L0-15 unknown route/custom 404 when reachable without an auth gate

Controlled evidence is still required for:
- L0-06 application restart
- L0-07 worker restart
- L0-08 WhatsApp socket/session recovery
- L0-09 browser console
- L0-10 authenticated dashboard network
- L0-11 repeated dashboard refresh
- L0-12 direct authenticated dashboard URLs
- L0-16 intentional safe error/error-boundary rendering

The live runner writes `artifacts/qa/l0-report.json` and exits non-zero on a definite FAIL.

## L1 — Authentication & Account

Automated coverage now includes:
- L1-01 through L1-07 registration input rules
- L1-09 existing email rejection without returning account data
- L1-10 valid credentials
- L1-11 wrong password
- L1-12 nonexistent account gets the same authentication result
- L1-13 persistent login rate-limit gate
- L1-15 logged-out dashboard redirect
- L1-16 forgot-password request
- L1-17 account-enumeration-safe forgot-password response
- L1-18 valid reset
- L1-19 reset token single-use
- L1-20 expired reset token
- L1-23 suspended account rejected
- L1-24 reactivated account accepted
- L1-25 registration disabled
- L1-26 registration re-enabled

Still controlled E2E/live:
- L1-08 confirm-password mismatch is currently a client/UI concern and needs browser validation
- L1-14 logout invalidates the real browser/session cookie
- L1-21 old password cannot login after real DB reset
- L1-22 new password can login after real DB reset

## L2 — RBAC & Tenant Isolation P0

Automated P0 coverage includes:
- L2-01..L2-05 dashboard administration routes rejected for USER
- L2-06 access policy prevents admin navigation from being considered available to USER
- L2-07 SUPERADMIN administration access
- L2-08 session/device cross-tenant lookup
- L2-09 chat operations inherit the session ownership boundary
- L2-10 private media tenant scoping
- L2-11 MessageJob tenant scoping
- L2-12 Broadcast tenant scoping
- L2-13 Campaign tenant scoping
- L2-14 Segment tenant scoping
- L2-15 Schedule scoped through an actor-owned session
- L2-16 AutoReply rejects session/tenant mismatch before rule access
- L2-17 Webhook replay stays inside tenant-scoped endpoint
- L2-18 IntegrationToken list/revoke tenant scope
- L2-19 API key list/revoke owner scope
- L2-20 guessed foreign IDs are covered across the resource matrix
- L2-21 representative denied operations assert that mutation/audit writes do not happen

A single L2 failure must block release.

## CI layers

Every PR to `main` now gets a dedicated QA Roadmap Gate:

1. TypeScript typecheck
2. ESLint
3. L1 focused tests
4. L2 focused tests
5. Full Vitest regression
6. Production Next.js build

A manual GitHub Actions dispatch can additionally run L0 against a live deployment and upload the JSON evidence.

## Next phases

Do not automate all 18 phases in one uncontrolled change. After L0/L1/L2 are green, continue in separate `chatgpt-qa-...` branches:
- L3–L5: session + WhatsApp messaging/API, with real WA actions kept controlled/live
- L6: message-queue failure injection
- L7–L13: broadcast/campaign/scheduler/autoreply/webhooks and related workflows
- L14: API key scope/idempotency matrix
- L15–L17: integrations, billing, administration/operations
- L18: restart/recovery, backup/restore, concurrency, secret leakage and production gate
