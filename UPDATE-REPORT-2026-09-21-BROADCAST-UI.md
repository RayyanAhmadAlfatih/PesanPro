# PesanPro — Broadcast Personalization & UI Update Report

**Date:** 2026-09-21  
**Base:** PesanPro 0.1.0 audited/hardened build  
**Scope:** Broadcast CSV template, per-recipient variables, UI alignment to supplied PesanPro design references, regression hardening

## 1. Added: downloadable Broadcast CSV template

A reusable CSV sample is now shipped at:

`/public/templates/pesanpro-broadcast-template.csv`

It is exposed from the Broadcast UI through **Unduh contoh CSV**. The bundled example contains:

```csv
phone,name,company,invoice_no
628123456789,Ayu Setiawan,Nusantara Store,INV-2026-001
628987654321,Budi Kurnia,Studio Laju,INV-2026-002
```

The user can download, edit, add/remove personalization columns, and import the file again.

Recognized phone-column aliases include `phone`, `phone_number`, `mobile`, `number`, `recipient`, `jid`, `nomor`, `nomor_hp`, `no_hp`, `telepon`, `telephone`, `whatsapp`, `no_whatsapp`, and `wa`.

CSV safety limits remain bounded: maximum 2 MB, 5,000 recipient rows, 20 columns, and 1,000 characters per personalization value.

## 2. Added: Broadcast variables / merge tags

Broadcast messages now support per-recipient tags such as:

- `{{name}}`
- `{{company}}`
- `{{invoice_no}}`

CSV headers are normalized to safe variable names. Example: `Invoice No` becomes `invoice_no`.

The Broadcast page shows detected variable tags as clickable chips and inserts the selected tag at the current message cursor position. It also previews the first imported rows and uses the first recipient's variables for message preview.

### Spintax compatibility

Existing Spintax continues to work:

`{Halo|Hai} {{name}}, invoice {{invoice_no}} sudah tersedia.`

Variables are protected while Spintax is parsed and rendered, then substituted afterward. This is deliberate: a CSV value such as `{Ayu|Budi}` remains ordinary customer data and is **not** interpreted as executable Spintax.

## 3. Durable backend integration

Personalization is implemented in the existing durable Broadcast pipeline, not as a separate send path.

Changes include:

- optional `recipientData` request field while keeping the existing `recipients` field;
- per-recipient `variables` stored on `BroadcastRecipient`;
- variable rendering immediately before `MessageJob` enqueue;
- existing suppression, opt-in, quota, delay, worker lease, retry, idempotency, media, and MessageJob semantics remain in place;
- only variables actually referenced by the message template are persisted, reducing unnecessary personal-data storage;
- old non-personalized requests retain the pre-existing idempotency request-hash shape for backward compatibility.

A new migration was added instead of editing historical migrations:

`prisma/migrations/20260921020000_broadcast_recipient_variables/migration.sql`

```sql
ALTER TABLE `BroadcastRecipient`
  ADD COLUMN `variables` JSON NULL AFTER `jid`;
```

Existing rows remain valid because the new field is nullable.

## 4. UI update

The dashboard shell and shared UI primitives were aligned to the supplied PesanPro design contract while retaining existing application routes, authorization, navigation permissions, session selection, and action logic.

Applied visual direction:

- paper canvas `#fcfaf5`;
- dark ink `#1a3300`;
- yellow active/attention state;
- mint healthy/selected state;
- teal informational state;
- blush inactive/paused state;
- terracotta notification/pressure state;
- 268 px desktop sidebar and 72 px top bar;
- compact cards with 12 px radius and no decorative default shadow;
- 44 px minimum interactive controls;
- outlined pill tabs with yellow active state;
- mint table headers and subtle yellow row hover;
- removal/neutralization of the previous decorative glass/gradient/glow styling across the dashboard surfaces supplied in the UI reference set;
- removal of continuously pulsing status decoration; status meaning remains conveyed by text and static color.

The Broadcast screen was rebuilt around the same design language with three operational tabs: creation, history, and suppression list. Existing endpoints and actions were retained.

The dashboard home was visually reorganized using the supplied reference while continuing to use existing live application data. No fake production metrics were introduced.

## 5. Changed source scope

47 files differ from the previously audited/hardened build, including this update report. Changes are limited to:

- Broadcast CSV/template/input/policy/service/worker code;
- Broadcast API preview/import behavior;
- Broadcast page UI;
- one additive Prisma migration/schema field;
- dashboard shell/home presentation;
- style-only alignment of the existing Auto Reply, Billing, Campaigns, Commercial, Inbox, Media, Message Queue, Notifications, Scheduler, Session Detail, System Monitor, Users, session manager, and webhook-log surfaces;
- shared visual UI primitives and global CSS;
- tests for Broadcast CSV/template behavior.

Core WhatsApp session transport, authentication, billing policy, webhook engine, campaign worker, scheduler worker, and route naming were not rewritten as part of this UI/feature update.

## 6. Verification performed

### PASS

- Broadcast CSV + variable + Spintax behavior regression.
- CSV header normalization and `nomor_hp` phone-column alias.
- Variables and Spintax can coexist.
- CSV variable values are not executed as Spintax.
- First-recipient personalized preview renders correctly.
- TypeScript/TSX syntax/transpile scan: **395 files, 0 failures** (declaration files excluded from emit scan).
- No merge-conflict markers in source/migrations/integrations/scripts/public.
- Contact Form 7 policy test PASS.
- All CF7 PHP files pass `php -l`.
- Release-tree scan found only `.env.example`; no actual `.env`, runtime logs, or user media payloads.

### Not claimed as PASS

A fresh full `npm ci` could not be completed in the execution environment because npm registry access timed out and the required package cache was incomplete (including `zod-validation-error-4.0.2.tgz`). Therefore this report does **not** claim fresh full `npm test`, `npm run typecheck`, `npm run lint`, or `npm run build` PASS.

Before production deployment, run those commands in the normal project environment after dependencies install successfully.

## 7. Deployment note

Apply the new database migration before enabling personalized Broadcasts in production:

```bash
npm run db:migrate
```

Then run the standard project release checks (`typecheck`, tests, lint, build, release preflight) and a staging Broadcast test using a small CSV before production traffic.
