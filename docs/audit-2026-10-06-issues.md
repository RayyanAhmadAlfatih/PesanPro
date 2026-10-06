# PesanPro audit — GitHub issue bodies (2026-10-06)

Ready-to-file issue bodies produced by the 2026-10-06 audit. Full detail, including the
"Verified OK" list, is in `AUDIT-REPORT-2026-10-06.md`.

Fixes for the issues marked **FIXED ON BRANCH** are on `workbuddy-audit-hardening-2026-10`.

---

## [HIGH] Client IP is taken from a spoofable `X-Forwarded-For` header

**Severity:** High
**Labels:** `security`, `authentication`, `rate-limiting`
**Status:** FIXED ON BRANCH

### Evidence

- `src/lib/rate-limit.ts:121-136` — `getClientIp` returns the leftmost `x-forwarded-for` entry, then `x-real-ip`, with no trusted-proxy check.
  ```ts
  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  ```
- `src/lib/api-auth.ts:91` — `getUserByApiKey(apiKey, getClientIp(request.headers))`
- `src/lib/api-key-auth.ts:76` — `isIpAllowed(storedKey.ipAllowlist, clientIp)`
- `src/lib/auth.ts:28-30`, `src/app/api/auth/register/route.ts:18-19`, `src/app/api/auth/forgot-password/route.ts:12-13`, `src/app/api/auth/reset-password/route.ts:14-15` — all rate-limit keys derive from that value.
- `src/lib/env.ts` had no `TRUST_PROXY` switch, so the header was trusted unconditionally.

### Reproduction

```bash
# API-key IP allowlist bypass (key allowlisted to 203.0.113.10 only)
curl https://<host>/api/v1/media -H 'x-api-key: wag_<leaked-key>' -H 'X-Forwarded-For: 203.0.113.10'

# Login brute force: 5/15min becomes unlimited
for i in $(seq 1 500); do
  curl -X POST https://<host>/api/auth/login -H "X-Forwarded-For: 10.0.0.$i" \
    -d '{"email":"victim@example.com","password":"guess'$i'"}'
done

# Password-reset mail bombing: 5/hour becomes unlimited
for i in $(seq 1 200); do
  curl -X POST https://<host>/api/auth/forgot-password -H "X-Forwarded-For: 172.16.0.$i" \
    -d '{"email":"victim@example.com"}'
done
```

### Impact

- The API-key IP allowlist — the only network control on API keys — is fully bypassable; any leaked key becomes globally usable.
- Login brute force is unthrottled (there is no account lockout).
- Unlimited password-reset mail bombing and mass registration.
- Audit records (`recordAudit`, `integrationUsageLog.remoteIp`) capture a forged source IP.

### Fix

`src/server/runtime.ts` now stamps a transport-derived `x-pesanpro-client-ip` header on every
request, overwriting anything the client sent. `getClientIp` prefers it. New `TRUST_PROXY`
(default `false`) and `TRUST_PROXY_HOPS` env vars decide whether `x-forwarded-for` is honored at
all; when it is, the chain is walked from the right so prepended entries cannot be forged.

**Deployment note:** the default is secure-by-default (socket address). If PesanPro sits behind
Nginx/Cloudflare/Traefik, set `TRUST_PROXY="true"` (and `TRUST_PROXY_HOPS` to the number of
proxies), otherwise all clients share the proxy's IP and per-IP limits collapse.

---

## [HIGH] Arbitrary file write via message-controlled path components in `downloadAndSaveMedia`

**Severity:** High
**Labels:** `security`, `path-traversal`
**Status:** FIXED ON BRANCH

### Evidence

`src/lib/webhook.ts:137-159`
```ts
const mime = typeof mediaObj.mimetype === "string" ? mediaObj.mimetype : null;
if (mime) {
    const mimeExt = mime.split('/')[1]?.split(';')[0];   // unvalidated
    if (mimeExt) ext = mimeExt;
}
const filename = `${sessionId}-${message.key.id}.${ext}`; // unsanitized
const filePath = path.join(process.cwd(), "data", "media", filename);
await runWithStorageQuota({...}, () => writeFile(filePath, buffer));
```

`message.key.id` and the declared `mimetype` are both attacker-influenced. `src/lib/remote-media.ts:36`
and `src/lib/private-media.ts:67` already apply `path.basename`; this path does not.

### Reproduction

Send an inbound document message with `documentMessage.mimetype` set to
`x/..\..\..\..\..\..\tmp\pwn` (Windows) or `x/../../../tmp/pwn` (POSIX), or with traversal
segments in `key.id`. The write resolves outside `data/media`.

### Impact

Arbitrary-path file write with attacker-controlled bytes and an attacker-chosen extension, under
the Node process's permissions — a path to overwriting configuration or planting a loadable module
(RCE) on a writable application directory. Also bypasses storage-quota accounting for those bytes.

### Fix

Extension restricted to a strict allowlist; both path components reduced with `path.basename` plus
charset filtering; resolved-path containment asserted before `writeFile`.

---

## [HIGH] SSRF: raw `fetch()` of a message-supplied `directPath`

**Severity:** High
**Labels:** `security`, `ssrf`
**Status:** FIXED ON BRANCH

### Evidence

`src/lib/webhook.ts:85-98`
```ts
const downloadUrl = directPath.startsWith("http") ? directPath : `https://mmg.whatsapp.net${directPath}`;
try {
    const res = await fetch(downloadUrl, {          // no validatePublicUrl / safeFetch
        method: 'GET',
        headers: { 'Origin': 'https://web.whatsapp.com' }
    });
    buffer = Buffer.from(await res.arrayBuffer());  // unbounded
```

Every other fetch in the media subsystem uses `src/lib/ssrf.ts`
(`remote-media.ts:18`, `v1/media/import/route.ts:23`, `chat.service.ts:255-305`). This branch has
no protocol/host/port allowlist, no DNS validation, no redirect re-validation, no size cap, and
`fetch` follows redirects by default.

### Reproduction

Deliver an inbound media message with no `mediaKey` and
`directPath: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"`. The gateway
fetches it server-side and persists the body as media, retrievable via `/api/media/<filename>`.

### Impact

SSRF from the gateway host into the internal network or the cloud metadata endpoint, with the
response exfiltrated to the tenant — credential theft and internal service enumeration. The
unbounded `arrayBuffer()` is also a memory-exhaustion vector.

### Fix

Routed through `safeFetchBuffer` with a timeout and byte cap.

---

## [HIGH] Storage-quota reservations are permanently orphaned when settlement or object deletion fails

**Severity:** High
**Labels:** `bug`, `billing`, `data-integrity`
**Status:** FIXED ON BRANCH

### Evidence

- `src/lib/storage-quota.ts:18-29` — `stored = true` is set before `commitReservedUsage`; if the
  commit throws, the `if (!stored)` release branch is skipped and the reservation is never settled.
- `src/lib/private-media.ts:153-159` — the row is committed `DELETED` at `:146-149`, then
  `deletePrivateMediaObject(...)` (throws on B2 errors, `private-media-storage.ts:197-199`) runs
  **before** `releaseStorageQuota(...)`.
- `src/lib/private-media-lifecycle.ts:67-73` — same ordering, and the throw aborts the whole
  retention batch.
- `src/lib/usage.ts:196` — `reserved` participates in the quota check, and no reconciler exists
  anywhere in the codebase (`operations-maintenance.ts` never touches usage counters).

### Reproduction

With `MEDIA_STORAGE_DRIVER=b2`, revoke `s3:DeleteObject` (or simulate a 5xx), then
`DELETE /api/v1/media/{id}`. The API returns 500, the row is already `DELETED`, and
`UsageCounter.consumed` for `MEDIA_STORAGE_BYTES` is never decremented. The row is also excluded
from future purge (filters `status: "ACTIVE"`).

### Impact

Every failure permanently shrinks the tenant's usable quota until they cannot upload or send at
all, with no self-service recovery. Storage also leaks in B2 while continuing to be billed.

### Fix

Always attempt to settle the reservation on any failure (settlement is idempotent), and release the
storage quota even when the object delete fails, logging the orphan instead.

---

## [HIGH] `safeFetchBuffer` buffers the whole response before enforcing `maxBytes`

**Severity:** High
**Labels:** `security`, `dos`
**Status:** FIXED ON BRANCH

### Evidence

`src/lib/ssrf.ts:219-231`
```ts
const res = await safeFetch(rawUrl, {}, opts);
if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
const ab = await res.arrayBuffer();          // full body already in memory
const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
if (ab.byteLength > maxBytes) throw new SSRFError(...);   // checked too late
```

The `Content-Length` pre-check at `:199-205` is advisory — a server can omit it or use chunked
encoding. Same pattern at `src/app/api/v1/media/import/route.ts:25-26`.

### Reproduction

```bash
curl -X POST https://<host>/api/v1/media/import -H 'x-api-key: wag_...' \
  -H 'content-type: application/json' -d '{"url":"https://attacker.example/stream"}'
```
where the server replies `200` with `Transfer-Encoding: chunked` and an endless body.

### Impact

One authenticated request — or one inbound message on the SSRF path — can allocate an unbounded
buffer and exhaust the heap, taking down the API and every embedded worker in the same process.

### Fix

Body read through a stream reader that aborts as soon as the byte budget is exceeded; reused from
the import route.

---

## [MEDIUM] Cross-tenant label detachment (BOLA)

**Severity:** Medium
**Labels:** `security`, `tenant-isolation`, `idor`
**Status:** FIXED ON BRANCH

### Evidence

`src/app/api/labels/[sessionId]/chat/[jid]/labels/route.ts:109-117`
```ts
} else {
    // Remove labels from chat
    await prisma.chatLabel.deleteMany({
        where: {
            labelId: { in: labelIds },   // no sessionId scope
            chatJid: decodedJid
        }
    });
}
```
The `add` branch above (`:80-108`) verifies `label.sessionId !== sessionId`; the `remove` branch
does not. `canAccessSession` only proves ownership of the session in the URL.

### Reproduction

As tenant A (owning session `S_A`):
```
PUT /api/labels/S_A/chat/62812xxxx@s.whatsapp.net/labels
{"labelIds":["<label id owned by tenant B>"],"action":"remove"}
```
Tenant B's `chatLabel` rows are deleted.

### Impact

Cross-tenant data mutation — an attacker strips another tenant's chat↔label associations. Requires
knowing a foreign label id, but ids appear in API responses and the endpoint accepts arbitrary
arrays.

### Fix

Requested label ids are resolved against `sessionId` once, and only the owned subset is operated on
in both branches. `labelIds` element types are validated.

---

## [MEDIUM] Password reset spends bcrypt CPU before validating the token

**Severity:** Medium
**Labels:** `security`, `dos`
**Status:** FIXED ON BRANCH

### Evidence

`src/lib/password-reset.ts:92-93`
```ts
const tokenHash = hashPasswordResetSecret(secret);
const passwordHash = await bcrypt.hash(parsedPassword.data, 12);   // cost 12, any token
const now = new Date();
```
The token is only looked up afterwards, at `:97`. The route is unauthenticated.

### Reproduction

```bash
for i in $(seq 1 10000); do
  curl -X POST https://<host>/api/auth/reset-password \
    -d '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","password":"Abcdef12345"}'
done
```
Each request forces a full cost-12 hash before the token is rejected.

### Impact

Unauthenticated CPU exhaustion. Combined with the spoofable-IP issue, a modest request rate
saturates the event loop and degrades every tenant on the instance.

### Fix

Token validated with a cheap indexed lookup before hashing.

---

## [MEDIUM] Message jobs that crash a worker re-claim forever (unbounded poison pill)

**Severity:** Medium
**Labels:** `bug`, `reliability`, `queue`
**Status:** FIXED ON BRANCH

### Evidence

`src/lib/message-queue.ts:21-45`
```sql
WHERE
  (status = 'QUEUED' AND availableAt <= ${now})
  OR (status = 'PROCESSING' AND leaseExpiresAt < ${now})
```
No `attempts < maxAttempts` predicate, unlike the auto-reply queue
(`autoreply-queue.ts:45`). `recoverMessageJobsForWorker` (`:214-226`) requeues with `attempts`
unchanged.

### Reproduction

A job that kills the process instead of throwing (e.g. a media buffer that OOMs the worker) never
reaches `failMessageJob`. On restart, recovery requeues it, the claim increments `attempts`, and
dispatch kills the process again — `maxAttempts` is never consulted at claim time.

### Impact

A single poison job creates an unbounded crash/restart loop for the message worker, taking message
delivery down for all tenants, with `attempts` growing without limit.

### Fix

`attempts < maxAttempts` added to the claim predicate (both the inner `SELECT` and the outer
`WHERE`), plus a `deadLetterExhaustedMessageJobs()` sweep invoked once per worker start to terminal-
ise jobs that exhausted their attempts while holding an expired lease.

---

## [MEDIUM] Payment proofs bypass `MEDIA_STORAGE_BYTES` accounting

**Severity:** Medium
**Labels:** `bug`, `billing`
**Status:** OPEN — scoped follow-up

### Evidence

`src/lib/payment-proof.ts:50-57`
```ts
const storagePath = proofStoragePath(input.userId, input.verificationId, inspection.extension);
await storePrivateMediaObject({ storagePath, buffer: prepared.buffer, mimeType: inspection.mimeType });
```
No `runWithStorageQuota` wrapper, unlike `private-media.ts:70-99`. `deleteStoredPaymentProof`
(`:60-62`) releases nothing.

### Reproduction

`POST /api/payment-verifications` with a ~5 MB PDF; `UsageCounter.consumed` for
`MEDIA_STORAGE_BYTES` is unchanged.

### Impact

Payment-proof bytes are never counted against any entitlement and never billed — uncapped,
unbilled object-storage growth, bounded only by the 5/hour submission limit (~600 MB/day/account).

### Fix

Wrap the store in `runWithStorageQuota` and release on delete/replace. A correct fix requires
threading `userId` + `sizeBytes` into `deleteStoredPaymentProof` and its callers, which exceeds the
isolation scope of the current pass.

---

## [MEDIUM] Account enumeration on registration

**Severity:** Medium
**Labels:** `security`, `auth`
**Status:** OPEN — product decision required

### Evidence

`src/app/api/auth/register/route.ts:45-50`
```ts
if (existingUser) {
    return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
}
```
`forgot-password` returns a uniform body (`:35-38`), so registration is the weaker endpoint. A
secondary timing channel exists in `requestPasswordReset`: `password-reset.ts:49-51` returns
immediately for unknown emails while `:69-76` awaits an outbound HTTPS call for known ones.

### Impact

Reliable discovery of valid accounts, feeding targeted phishing and online brute force.

### Fix

Return a neutral response (or move to email verification). Not applied because it changes the
documented registration response contract and the signup UX.

---

## [MEDIUM] Changing a user's email does not invalidate their sessions

**Severity:** Medium
**Labels:** `security`, `session-management`
**Status:** FIXED ON BRANCH

### Evidence

`src/app/api/users/[id]/route.ts:53-55`
```ts
if (password || role || status) {
    updateData.sessionVersion = { increment: 1 };
}
```
`email` is absent, so the login identity can change while existing JWTs stay valid.

### Reproduction

As SUPERADMIN: `PATCH /api/users/<id>` with `{"email":"new@example.com"}`. The victim's current
session keeps working.

### Impact

Weakened account-takeover hygiene — identity changes are not reflected in session revocation.

### Fix

`email` added to the invalidation condition.

---

## [MEDIUM] `failMessageJob` rewrites already-`SENT` broadcast recipients as `FAILED`

**Severity:** Medium
**Labels:** `bug`, `reporting`
**Status:** FIXED ON BRANCH

### Evidence

`src/lib/message-queue.ts:152-155`
```ts
await tx.broadcastRecipient.updateMany({
    where: { messageJobId: job.id, status: { in: ["ENQUEUED", "SENT"] } },
    data: { status: "FAILED", ... },
});
```
A recipient already advanced to `SENT` by `recordMessageDeliveryStatus` (`:264-270`) can be
downgraded by a later failure path for the same job.

### Impact

Broadcast/campaign reporting and the `message.status` webhook contract report delivered messages as
failed — silently.

### Fix

Only recipients still in `ENQUEUED` are downgraded.

---

## [MEDIUM] Payment-proof upload buffers the entire multipart body before the size check

**Severity:** Medium
**Labels:** `security`, `dos`
**Status:** FIXED ON BRANCH

### Evidence

`src/app/api/payment-verifications/route.ts:55-64`
```ts
const contentLength = Number(request.headers.get("content-length") ?? "0");
if (Number.isFinite(contentLength) && contentLength > PAYMENT_PROOF_MAX_BYTES + 256 * 1024) {
  return NextResponse.json({ error: "..." }, { status: 413 });
}
const form = await request.formData().catch(() => null);   // buffers everything
const proof = form?.get("proof");
const buffer = Buffer.from(await proof.arrayBuffer());     // 5 MB check applied far too late
```
`request.formData()` reads the whole body into memory. With no `Content-Length` the guard collapses
to `0` and passes.

### Reproduction

POST a chunked `multipart/form-data` body with an unbounded `proof` part (see the audit report for
the full request). The server allocates the entire body before `storePaymentProof` can reject it.

### Impact

Any authenticated tenant (registration is open) can force an unbounded allocation and OOM the
process, taking down the API and every embedded worker. The 5/hour limiter still allows five
multi-GB attempts.

### Fix

Streaming Busboy parser (`parsePaymentProofUpload`) mirroring the hardened private-media upload
path; the file stream is capped while it is read, never after.

---

## [LOW] Webhook destination rate limit is shared across tenants

**Severity:** Low · **Labels:** `reliability`, `tenant-isolation` · **Status:** OPEN

`src/lib/webhook-outbox.ts:344-348` keys the limiter on `new URL(...).hostname` only, so one tenant
flooding a shared receiver host degrades another tenant's deliveries to that host.

---

## [LOW] Schedule/broadcast retry has no attempt cap; schedules retry with no backoff

**Severity:** Low · **Labels:** `bug`, `reliability` · **Status:** OPEN

`src/lib/schedule-queue.ts:238`, `src/lib/broadcast-queue.ts:253`,
`src/lib/message-job-errors.ts:28`. A schedule whose enqueue throws a generic error is classified
retryable, the lock is cleared, `nextRunAt` never advances, and the worker re-claims it every poll
(~1 s) indefinitely — a tight loop against WhatsApp and the DB, with account-ban risk.

---

## [LOW] `reconcileCampaign` loads a campaign by id with no tenant predicate

**Severity:** Low · **Labels:** `tenant-isolation` · **Status:** OPEN

`src/lib/campaign-queue.ts:206`. Latent cross-tenant read/write; safe today only because all
callers are system-internal.

---

## [LOW] Webhook and media failures are swallowed with bare `catch {}`

**Severity:** Low · **Labels:** `observability` · **Status:** OPEN

`src/lib/webhook.ts:294-298`, `:370-374`, `src/modules/whatsapp/message-adapter.ts:73`. Lost event
delivery and lost media persistence with no log, metric, or retry — invisible data loss, and
inconsistent with `dispatchWebhook` (`webhook.ts:45-47`) which does log.

---

## [LOW] `forgot-password` reports success when email delivery is impossible

**Severity:** Low · **Labels:** `bug`, `auth` · **Status:** OPEN

`src/lib/password-reset.ts:20-22`, `:69-78`. With `RESEND_API_KEY` unset the endpoint returns
success while no email is ever sent; users are locked out with no signal and only a server log
records it.

---

## [LOW] N+1 per-recipient queries inside the broadcast send loop

**Severity:** Low · **Labels:** `performance` · **Status:** OPEN

`src/lib/broadcast-queue.ts:151-160`, plus a per-recipient `requireEntitlement` at `:210` and the
~6 queries inside `enqueueMessage`. ~8 sequential round-trips per recipient — roughly 40k queries
for a 5,000-recipient broadcast.

---

## [LOW] Idempotency TTL is never enforced and expired records are never purged

**Severity:** Low · **Labels:** `bug`, `housekeeping` · **Status:** OPEN

`src/lib/message-job-service.ts:87`, `:174`. The lookup ignores `expiresAt`, so the documented
7-day key reuse is not honored and clients cannot reuse a key after the TTL; nothing deletes
expired rows, so the table grows without bound.

---

## [LOW] Auto-reply throttle counter is consumed before the enqueue can succeed

**Severity:** Low · **Labels:** `bug` · **Status:** OPEN

`src/lib/autoreply-queue.ts:135`, `:218`. The cooldown/rate counter is incremented inside the
transaction, then `enqueueSnapshot` may throw; the counter has already advanced, so the next genuine
message from that contact can be dropped by `CONTACT_RATE_LIMITED`.

---

## [LOW] `.env.example` ships placeholder admin credentials that startup auto-provisions from

**Severity:** Low · **Labels:** `security`, `hardening` · **Status:** OPEN (largely mitigated)

`.env.example:244-245`, `start.sh:110-115`, `Dockerfile:41`. **Mitigated:** `scripts/setup-admin.mjs`
enforces 10-128 characters with upper+lower+digit, so the shipped placeholder
(`change-this-in-production`) is rejected and no admin is created. The placeholder should still be
removed so an operator is never tempted to weaken the policy to make boot succeed.
