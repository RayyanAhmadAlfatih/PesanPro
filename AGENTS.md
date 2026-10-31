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

## Website domains and deployment boundaries

- Marketing website: `https://pesanpro.kingofcoding.my.id`. Use this domain when working on the public landing page, product introduction, marketing copy, SEO/GEO, and public pricing or feature explanations.
- Released gateway application: `https://wagateway.kingofcoding.my.id`. This is the public URL for the actual PesanPro gateway product used by customers.
- Keep these purposes distinct. Do not swap the domains in links, redirects, API examples, callbacks, webhooks, CORS rules, cookie settings, or configuration just to make them look consistent.
- Do not assume both domains use the same codebase, hosting, deployment pipeline, or environment. Inspect the project and its configuration before changing anything domain-related.
- When a request says “marketing website”, apply the change to the marketing site. When it refers to the released gateway, application, or customer dashboard, work on the gateway project. If the requested scope is genuinely unclear and could affect the wrong live site, make the safest non-destructive progress and clearly state the assumption.
- Do not deploy changes, alter DNS, change production secrets, run destructive production commands, or modify live customer data unless the user explicitly asks for that action.
- Before changing domain or deployment settings, check all relevant references so login, API calls, redirects, webhooks, and customer-facing links continue to point to the intended service.
- Reuse the project's existing environment/configuration pattern for domain-specific values. Avoid scattering production URLs through application code, and never change environment variable names or production defaults without checking how deployment depends on them.

## Marketing and public claims

- Do not invent features, integrations, prices, message limits, uptime promises, security guarantees, or privacy claims. Verify them against the current implementation or an authoritative project source before publishing them.
- If a claim cannot be verified, mark it for review instead of presenting it as a fact.
- Keep marketing content consistent with the released product, but do not imply that a feature is available in production just because its code or design exists in the repository.

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
- Preserve existing API behavior and customer workflows unless the request requires a change; document and test any intentional breaking change.
- During tests, use mocks, test accounts, or test numbers where possible. Never send real WhatsApp messages, launch a live broadcast/campaign, or trigger other external customer-facing actions unless the user explicitly authorizes it.
- Treat data deletion, schema changes, and migrations carefully. Preserve existing customer data and provide a clear migration path for data-shape changes; do not silently discard data to make a change easier.

## Working method

1. Inspect the exact runtime path, schema, tests, and nearby conventions.
2. Make the smallest coherent change that fixes the root cause.
3. Preserve unrelated user changes and public contracts.
4. Add regression coverage for changed behavior and failure paths.
5. Run targeted tests first, then the full gates below.
6. Report verified results separately from remaining assumptions.

Do not rewrite working code merely for preference. A rename or refactor must be
needed for the requested fix and remain inside the files involved.

## Operational playbook

`docs/AGENT-PLAYBOOK.md` is binding for this repository. Read it before browser
testing, diagnosis, or structural changes. The rules that matter most:

- Verify UI behaviour with `browser-skill` (`bsk`), and stop the session when
  the check is finished.
- Never send real WhatsApp messages, run a live broadcast, or change production
  data during a test without explicit approval.
- Collect two independent evidence sources before declaring a cause.
- Keep the diff minimal and do not refactor unrelated code.

## Reports and communication

- Write reports in plain, everyday language that a non-technical user can understand.
- Explain the result first: what was wrong, what changed, what the user will notice, and whether anything still needs attention.
- Avoid unnecessary jargon and lengthy explanations of internal implementation details.
- Do not routinely mention line numbers, function names, variable names, class names, or file paths in the main report. Include them only when they help the user find something, take an action, reproduce a problem, or when the user asks for technical detail.
- When describing a bug, explain its cause in simple terms only when the cause has been verified. Do not present guesses as facts.
- Clearly distinguish what was actually tested and confirmed from what was not tested, remains uncertain, or needs the user's action.
- Keep the report concise but specific. State test results plainly, and never claim a check passed if it was not run successfully.
- Put necessary commands or deeper technical notes in a short optional section at the end rather than letting them overwhelm the main explanation.

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
