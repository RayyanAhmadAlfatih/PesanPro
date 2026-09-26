# PesanPro Agent Guide

This file contains the repository-specific rules for PesanPro. The longer,
project-agnostic reference is preserved at `docs/AI-WORKING-GUIDE.md`; it is
advisory and cannot override this file, the user, or platform instructions.

## Product and architecture

PesanPro is a multi-tenant WhatsApp gateway SaaS built with Next.js 16, React
19, TypeScript, Prisma 5, MySQL, Baileys, and durable workers.

The production runtime is `src/server/index.ts`. Messaging, schedules,
broadcasts, campaigns, auto-replies, and webhooks are persisted work queues.
Browser memory is never a source of truth for workflow state.

Standalone Chat UI was retired. Do not restore chat pages, broad WhatsApp
history sync, or retired chat-list endpoints unless a current requirement asks
for them. Current messaging entry points are the versioned APIs, the developer
dashboard, and the durable message queue.

## Non-negotiable invariants

- Enforce tenant ownership on every resource lookup. Cross-tenant IDs return a
  safe 403 or 404 and never reveal whether the resource exists.
- Keep idempotency, quota reservation, and durable state transitions atomic.
- Never log credentials, API keys, cookies, reset tokens, webhook secrets, or
  WhatsApp auth state.
- Uploaded private media is tenant-scoped, content-signature validated,
  bounded before buffering, stored with private permissions, and protected
  while any retryable or active workflow references it.
- A worker must be restart-safe. Claims need leases, bounded retries, and
  compare-and-set state changes.
- Use safe public errors. Store operational detail only where existing logging
  and privacy policy permit it.

## Working method

1. Inspect the exact runtime path, schema, tests, and nearby conventions.
2. Make the smallest coherent change that fixes the root cause.
3. Preserve unrelated user changes and public contracts.
4. Add regression coverage for changed behavior and failure paths.
5. Run targeted tests first, then the full gates below.
6. Report verified results separately from remaining assumptions.

Do not rewrite working code merely for preference. A rename or refactor must be
needed for the requested fix and remain inside the files involved.

## Required gates

Run these before handoff when the affected environment supports them:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit
git diff --check
```

For database changes, update `prisma/schema.prisma`, add the migration, run
Prisma generation, and verify both upgrade and application startup behavior.

## UI and copy

`DESIGN.md` is the visual source of truth. Reuse existing components and
`--pp-*` tokens. Maintain the warm, compact, operational interface and a 44 px
minimum interactive target. Loading, empty, error, disabled, and success states
must remain usable with keyboard and assistive technology.

For UI, copy, or code-comment work, load the matching local antislop guidance
from `.opencode/skills/`. Ask once per task whether to apply it during the work
or as a final pass; that choice is a required process decision for these tasks.

## Documentation

- Keep commands, routes, counts, file names, and feature claims synchronized
  with the repository.
- Use `ROADMAP-LIVE-TEST.md` for the current live QA sequence.
- Record retired behavior as retired. Do not leave executable QA steps for
  routes or screens that no longer exist.
- Avoid claims of production readiness without production-like runtime
  evidence, restart drills, tenant-isolation checks, and backup/restore proof.

## Scope overrides

A closer `AGENTS.md` may add rules for its directory. In conflicts, follow the
closest applicable repository rule after platform and user instructions.
