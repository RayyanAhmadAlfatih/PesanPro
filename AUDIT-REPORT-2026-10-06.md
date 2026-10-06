# PesanPro security & correctness audit — 2026-10-06

**Scope:** full source audit of `RayyanAhmadAlfatih/PesanPro` at `main` (`8b0e1dd`), covering
authentication/authorization, tenant isolation (IDOR/BOLA), injection, SSRF, unsafe upload,
secret handling, rate limiting, billing/quota accounting, and durable-queue correctness.

**Method:** read every route handler under `src/app/api/**`, the auth/authorization core, the
billing/usage layer, the media + object-storage layer, the webhook subsystem, and all durable
worker queues. Findings were reproduced by tracing the runtime path end to end, not by static
pattern matching. A prior pass (`AUDIT-REPORT-2026-09-23.md`) is verified separately below.

**Status of this document:** findings only. Fixes live on branch `workbuddy-audit-hardening-2026-10`.

---

## 0. Verification of the four previously reported P1 findings

| # | Prior finding | Current state | Verdict |
|---|---|---|---|
| 1 | SSRF on webhook media download | Outbound **webhook delivery** now pins the validated IP and re-validates every redirect (`src/lib/webhook-transport.ts:45-88`, `175-196`). However a **different** fetch in the same feature — the newsletter `directPath` branch of `downloadAndSaveMedia` — still calls raw `fetch()` with no SSRF guard. | **Partially fixed.** The reported path is closed; an adjacent path in the same function was missed. Tracked as **H-3**. |
| 2 | Plaintext API-key fallback | `getUserByApiKey` still reads `user.apiKey` with the raw key (`src/lib/api-key-auth.ts:86`), but only to migrate the row to a SHA-256 hash in place (`:50-63`) and it never returns the plaintext. Keys are now hashed at rest. | **Fixed.** No action. |
| 3 | Cross-tenant label deletion | `DELETE /api/labels/[sessionId]/[labelId]` now calls `canAccessSession` before deleting (`:101-105`). But the **detach** endpoint's `remove` branch does not scope `labelId` to the session — the `add` branch does. | **Partially fixed.** Tracked as **M-1**. |
| 4 | Unused session timeout | Session validity is re-checked against `status` + `sessionVersion` on every request (`src/lib/api-auth.ts:122`, `src/auth.config.ts:27-36`, `src/server/socket.ts:61-69`); no dead timeout config remains. | **Fixed.** No action. |

---

## HIGH

### H-1 — Client IP is taken from a spoofable header, defeating API-key IP allowlists and every auth rate limit

**Evidence**

- `src/lib/rate-limit.ts:121-136` (pre-fix)
  ```ts
  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
  ```
- `src/lib/api-auth.ts:91` — `return await getUserByApiKey(apiKey, getClientIp(request.headers));`
- `src/lib/api-key-auth.ts:76` — `isIpAllowed(storedKey.ipAllowlist, clientIp) && ...`
- `src/app/api/auth/register/route.ts:18-19` — `checkPersistentRateLimit(\`register:${ip}\`, 5, 60 * 60 * 1000)`
- `src/lib/auth.ts:28-30` — `checkPersistentRateLimit(\`login:${ip}:${email}\`, 5, 15 * 60 * 1000)`
- `src/app/api/auth/forgot-password/route.ts:12-13`, `src/app/api/auth/reset-password/route.ts:14-15`

`x-forwarded-for` is entirely client-controlled. Nothing in the codebase verifies it came from a
trusted proxy, and `env.ts` had no `TRUST_PROXY` switch. The leftmost entry — the one an attacker
fully controls — was used for authorization.

**Reproduction**

```bash
# 1. API-key IP allowlist bypass. Key is allowlisted to 203.0.113.10 only.
curl https://wagateway.kingofcoding.my.id/api/v1/media \
  -H 'x-api-key: wag_<leaked-key>' \
  -H 'X-Forwarded-For: 203.0.113.10'      # accepted from any source IP

# 2. Login brute force. 5 attempts / 15 min becomes unlimited.
for i in $(seq 1 500); do
  curl -X POST https://wagateway.kingofcoding.my.id/api/auth/login \
    -H "X-Forwarded-For: 10.0.0.$i" \
    -d '{"email":"victim@example.com","password":"guess'$i'"}'
done

# 3. Password-reset mail bombing (5/hour -> unlimited).
for i in $(seq 1 200); do
  curl -X POST https://wagateway.kingofcoding.my.id/api/auth/forgot-password \
    -H "X-Forwarded-For: 172.16.0.$i" -d '{"email":"victim@example.com"}'
done
```

**Impact**

- The per-key IP allowlist — the only network control on API keys — is fully bypassable. Any
  leaked or logged key becomes globally usable.
- The login limiter is the sole brute-force control (there is no account lockout), so online
  password guessing becomes unthrottled.
- `forgot-password` (5/hour) and `register` (5/hour) become unbounded: mail bombing and mass
  account creation.
- Audit records (`recordAudit`, `integrationUsageLog.remoteIp`) record a forged source IP,
  destroying forensic integrity.

**Fix (H-1):** the custom Node server now stamps a transport-derived
`x-pesanpro-client-ip` header on every request (`src/server/runtime.ts`), overwriting anything the
client sent. `getClientIp` prefers it. New `TRUST_PROXY` / `TRUST_PROXY_HOPS` env vars gate whether
`x-forwarded-for` is honored at all; the default is `false` (secure by default).

---

### H-2 — Arbitrary file write via message-controlled path components in `downloadAndSaveMedia`

**Evidence** — `src/lib/webhook.ts:137-159` (pre-fix)
```ts
const mime = typeof mediaObj.mimetype === "string" ? mediaObj.mimetype : null;
if (mime) {
    const mimeExt = mime.split('/')[1]?.split(';')[0];   // no validation
    if (mimeExt) ext = mimeExt;
}
const filename = `${sessionId}-${message.key.id}.${ext}`; // no sanitization
const filePath = path.join(process.cwd(), "data", "media", filename);
...
await runWithStorageQuota({...}, () => writeFile(filePath, buffer));
```

Both `message.key.id` and the declared `mimetype` are attacker-influenced, and neither is
sanitized. Contrast with the hardened paths in the same codebase: `src/lib/remote-media.ts:36` and
`src/lib/private-media.ts:67` both apply `path.basename`.

**Reproduction**

Send an inbound document whose `documentMessage.mimetype` is
`x/..\..\..\..\..\..\tmp\pwn` (Windows) or `x/../../../tmp/pwn` (POSIX), or whose `key.id`
contains traversal segments. The write resolves outside `data/media`.

**Impact**

Arbitrary-path file write with attacker-controlled bytes and an attacker-chosen extension, under
the Node process's permissions. On a writable application directory this is a direct path to
overwriting configuration or planting a loadable module (RCE). Also bypasses storage-quota
accounting for the written bytes.

**Fix (H-2):** strict allowlist for the extension, `path.basename` + charset filtering for both
path components, and a resolved-path containment assertion before `writeFile`.

---

### H-3 — SSRF: raw `fetch()` of a message-supplied `directPath`

**Evidence** — `src/lib/webhook.ts:85-98` (pre-fix)
```ts
const downloadUrl = directPath.startsWith("http") ? directPath : `https://mmg.whatsapp.net${directPath}`;
try {
    const res = await fetch(downloadUrl, {          // no validatePublicUrl / safeFetch
        method: 'GET',
        headers: { 'Origin': 'https://web.whatsapp.com' }
    });
    buffer = Buffer.from(await res.arrayBuffer());  // unbounded
```

Every other URL fetch in the media subsystem routes through `src/lib/ssrf.ts`
(`remote-media.ts:18`, `v1/media/import/route.ts:23`, `chat.service.ts:255-305`). This one does not:
no protocol/host/port allowlist, no DNS validation, no redirect re-validation, no size cap, and
`fetch` follows redirects by default.

**Reproduction**

Deliver an inbound media message whose content object has no `mediaKey` and carries
`directPath: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"` (or an internal
service URL). The gateway issues the GET server-side and persists the response body as media,
retrievable through `/api/media/<filename>`.

**Impact**

Server-side request forgery from the gateway host into the internal network or the cloud metadata
endpoint, with the response exfiltrated to the tenant — i.e. credential theft and internal service
enumeration. Combined with the unbounded `arrayBuffer()`, also a memory-exhaustion vector.

**Fix (H-3):** route the fetch through `safeFetchBuffer` with a timeout and byte cap.

---

### H-4 — Storage-quota reservations are permanently orphaned when settlement or object deletion fails

**Evidence**

- `src/lib/storage-quota.ts:18-29` (pre-fix)
  ```ts
  let stored = false;
  try {
    const result = await operation();
    stored = true;
    await commitReservedUsage({...});     // if this throws, `stored` is already true
    return result;
  } catch (error) {
    if (!stored) {                        // ...so the reservation is never released
      await releaseReservedUsage({...}).catch(() => undefined);
    }
    throw error;
  }
  ```
- `src/lib/private-media.ts:153-159` — the row is committed as `DELETED` at `:146-149`, then
  `deletePrivateMediaObject(...)` (which throws on a B2 error, `private-media-storage.ts:197-199`)
  runs **before** `releaseStorageQuota(...)`. A B2 failure leaks the bytes permanently and the row
  is excluded from future purge (`status: "ACTIVE"` filter).
- `src/lib/private-media-lifecycle.ts:67-73` — same ordering, and the throw aborts the whole
  retention batch.

**Reproduction**

With `MEDIA_STORAGE_DRIVER=b2`, revoke `s3:DeleteObject` (or simulate a 5xx) and then
`DELETE /api/v1/media/{id}`. The API returns 500, the row is already `DELETED`, and
`UsageCounter.consumed` for `MEDIA_STORAGE_BYTES` is never decremented.

**Impact**

`reserved` participates in the quota check (`usage.ts:196`) and `consumed` backs the storage
entitlement, and **no reconciler exists anywhere in the codebase** (`operations-maintenance.ts`
never touches usage counters). Every failure therefore permanently shrinks the tenant's usable
quota until they are unable to upload or send at all — with no self-service recovery. Storage also
leaks in B2 while continuing to be billed.

**Fix (H-4):** always attempt to settle the reservation on any failure (settlement is idempotent),
and release the storage quota even when the object delete fails, logging the orphan instead.

---

### H-5 — `safeFetchBuffer` buffers the whole body before enforcing `maxBytes`

**Evidence** — `src/lib/ssrf.ts:219-231` (pre-fix)
```ts
const res = await safeFetch(rawUrl, {}, opts);
if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
const ab = await res.arrayBuffer();          // full body already in memory
const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
if (ab.byteLength > maxBytes) throw new SSRFError(...);   // checked too late
```

The `Content-Length` pre-check at `:199-205` is advisory: a server can omit it or use chunked
encoding. The same pattern appears at `src/app/api/v1/media/import/route.ts:25-26`.

**Reproduction**

```bash
# Server responds 200 with Transfer-Encoding: chunked and an endless body.
curl -X POST https://wagateway.kingofcoding.my.id/api/v1/media/import \
  -H 'x-api-key: wag_...' -H 'content-type: application/json' \
  -d '{"url":"https://attacker.example/stream"}'
```

**Impact**

A single authenticated request (or a single inbound message on the H-3 path) can allocate an
unbounded buffer, exhausting the heap and taking down the API and every embedded worker in the
same process. Unauthenticated for the inbound-message path.

**Fix (H-5):** read the body through a stream reader that aborts as soon as the byte budget is
exceeded, and reuse it from the import route.

---

## MEDIUM

### M-1 — Cross-tenant label detachment (BOLA)

**Evidence** — `src/app/api/labels/[sessionId]/chat/[jid]/labels/route.ts:109-117` (pre-fix)
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
The `add` branch immediately above (`:80-108`) does verify `label.sessionId !== sessionId`; the
`remove` branch does not. `canAccessSession` only proves the caller owns the session in the URL.

**Reproduction**

As tenant A (owning session `S_A`), call:
```
PUT /api/labels/S_A/chat/62812xxxx@s.whatsapp.net/labels
{"labelIds":["<label id owned by tenant B>"],"action":"remove"}
```
The `chatLabel` rows for tenant B's label are deleted.

**Impact**

Cross-tenant data mutation: an attacker strips another tenant's chat↔label associations. It
requires knowing a foreign label id, but ids are returned in API responses and are not treated as
secrets, and the same endpoint accepts arbitrary arrays for enumeration.

**Fix (M-1):** resolve the requested label ids against `sessionId` once and operate only on the
owned subset, in both branches.

---

### M-2 — Password reset spends bcrypt CPU before validating the token

**Evidence** — `src/lib/password-reset.ts:92-93` (pre-fix)
```ts
const tokenHash = hashPasswordResetSecret(secret);
const passwordHash = await bcrypt.hash(parsedPassword.data, 12);   // cost 12, for any token
const now = new Date();
```
The token is only looked up afterwards, at `:97`. The route is unauthenticated and, per H-1, was
not meaningfully rate limited.

**Reproduction**

```bash
for i in $(seq 1 10000); do
  curl -X POST https://wagateway.kingofcoding.my.id/api/auth/reset-password \
    -H "X-Forwarded-For: 10.1.$((i/256)).$((i%256))" \
    -d '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","password":"Abcdef12345"}'
done
```
Every request forces a full cost-12 bcrypt hash before the token is rejected.

**Impact**

Unauthenticated CPU exhaustion. Amplified by H-1 (no effective rate limit), a modest request rate
saturates the event loop and degrades every tenant on the instance.

**Fix (M-2):** validate the token with a cheap indexed lookup before hashing.

---

### M-3 — Message jobs that crash a worker re-claim forever (unbounded poison pill)

**Evidence** — `src/lib/message-queue.ts:21-45` (pre-fix)
```sql
WHERE
  (status = 'QUEUED' AND availableAt <= ${now})
  OR (status = 'PROCESSING' AND leaseExpiresAt < ${now})
```
No `attempts < maxAttempts` predicate — unlike the auto-reply queue, which has one
(`autoreply-queue.ts:45`). `recoverMessageJobsForWorker` (`:214-226`) requeues with `attempts`
unchanged.

**Reproduction**

A job that kills the process instead of throwing (for example one whose media buffer OOMs the
worker) never reaches `failMessageJob`. On restart, recovery requeues it, the claim increments
`attempts`, dispatch kills the process again. `maxAttempts` is never consulted at claim time, so
this repeats without bound.

**Impact**

A single poison job produces an unbounded crash/restart loop for the message worker, taking
message delivery down for all tenants and growing `attempts` without limit.

**Fix (M-3):** add `attempts < maxAttempts` to the claim, and dead-letter jobs that exhausted
their attempts while holding an expired lease.

---

### M-4 — Payment proofs bypass `MEDIA_STORAGE_BYTES` accounting entirely *(reported, not changed)*

**Evidence** — `src/lib/payment-proof.ts:50-57`
```ts
const storagePath = proofStoragePath(input.userId, input.verificationId, inspection.extension);
await storePrivateMediaObject({ storagePath, buffer: prepared.buffer, mimeType: inspection.mimeType });
```
No `runWithStorageQuota` wrapper, unlike `private-media.ts:70-99`. `deleteStoredPaymentProof`
(`:60-62`) releases nothing.

**Impact**

Payment-proof bytes are never counted against any entitlement and never billed. Bounded by the
5/hour submission limit at ~5 MB each (≈600 MB/day/account), but it is uncapped, unbilled object
storage growth and an inconsistency with the documented storage-quota invariant.

**Not changed:** a correct fix must also release quota on the delete/replace paths, which requires
threading `userId` + `sizeBytes` into `deleteStoredPaymentProof` and its callers. That is a wider
change than this pass's isolation rule allows, so it is left as a scoped follow-up.

---

### M-5 — Account enumeration on registration *(reported, not changed)*

**Evidence** — `src/app/api/auth/register/route.ts:45-50`
```ts
if (existingUser) {
    return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
}
```
`forgot-password` deliberately returns a uniform body (`:35-38`), so this endpoint is the weaker
of the two. A secondary timing channel also exists in `requestPasswordReset`
(`password-reset.ts:49-51` returns immediately for unknown emails, while `:69-76` awaits an
outbound HTTPS call for known ones).

**Impact**

Reliable discovery of valid accounts, feeding targeted phishing and the brute-force path from H-1.

**Not changed:** removing the disclosure requires changing the documented registration response
contract (or moving to email-verification flow), which the task's rules exclude. Flagged for a
product decision.

---

### M-6 — Changing a user's email does not invalidate their sessions

**Evidence** — `src/app/api/users/[id]/route.ts:53-55` (pre-fix)
```ts
if (password || role || status) {
    updateData.sessionVersion = { increment: 1 };
}
```
`email` is absent, so the login identity can change while the target's existing JWTs stay valid.

**Reproduction**

As SUPERADMIN, `PATCH /api/users/<id>` with `{"email":"new@example.com"}`; the victim's current
session keeps working.

**Impact**

Weakened account-takeover hygiene — identity changes are not reflected in session revocation.

**Fix (M-6):** include `email` in the invalidation condition.

---

### M-7 — `failMessageJob` rewrites already-`SENT` broadcast recipients as `FAILED`

**Evidence** — `src/lib/message-queue.ts:152-155` (pre-fix)
```ts
await tx.broadcastRecipient.updateMany({
    where: { messageJobId: job.id, status: { in: ["ENQUEUED", "SENT"] } },
    data: { status: "FAILED", ... },
});
```
A recipient already advanced to `SENT` by `recordMessageDeliveryStatus` (`:264-270`) can be
downgraded by a later failure path for the same job.

**Impact**

Broadcast/campaign reporting and the `message.status` webhook contract report delivered messages
as failed, and the error is silent.

**Fix (M-7):** only downgrade recipients still in `ENQUEUED`.

---

### M-8 — Payment-proof upload buffers the entire multipart body before the size check

**Evidence** — `src/app/api/payment-verifications/route.ts:55-64` (pre-fix)
```ts
const contentLength = Number(request.headers.get("content-length") ?? "0");
if (Number.isFinite(contentLength) && contentLength > PAYMENT_PROOF_MAX_BYTES + 256 * 1024) {
  return NextResponse.json({ error: "..." }, { status: 413 });
}
...
const form = await request.formData().catch(() => null);   // buffers everything
const proof = form?.get("proof");
...
const buffer = Buffer.from(await proof.arrayBuffer());     // only now is it 5 MB-checked
```
`request.formData()` reads the whole body into memory. When `Content-Length` is absent the guard
collapses to `0` and passes, so the 5 MB limit in `storePaymentProof` is applied far too late.

**Reproduction**

```bash
curl -X POST https://<host>/api/payment-verifications \
  -H 'Cookie: <any USER session>' \
  -H 'Content-Type: multipart/form-data; boundary=X' \
  -H 'Transfer-Encoding: chunked' \
  --data-binary @- <<'EOF'
--X
Content-Disposition: form-data; name="planId"

<plan id>
--X
Content-Disposition: form-data; name="reference"

REF123
--X
Content-Disposition: form-data; name="proof"; filename="a.pdf"
Content-Type: application/pdf

<stream multi-GB here>
EOF
```

**Impact**

Any authenticated tenant (registration is open) can force an unbounded allocation and OOM the
process, taking down the API and every embedded worker. The 5/hour limiter still permits five
multi-GB attempts.

**Fix (M-8):** a streaming Busboy parser (`parsePaymentProofUpload`) mirrors the already-hardened
private-media upload path: the file stream is capped while it is read, never after.

---

## LOW

| # | Finding | Evidence | Impact |
|---|---|---|---|
| L-1 | Webhook destination rate limit is keyed by hostname only, shared across tenants | `src/lib/webhook-outbox.ts:344-348` | One tenant flooding a shared receiver host degrades another tenant's deliveries to that host. |
| L-2 | Schedule/broadcast retry has no attempt cap; schedules retry with no backoff and never advance `nextRunAt` on generic errors | `src/lib/schedule-queue.ts:238`, `src/lib/broadcast-queue.ts:253`, `src/lib/message-job-errors.ts:28` | A schedule whose enqueue throws a generic error is re-claimed every poll (~1 s) indefinitely — a tight loop against WhatsApp and the DB, with ban risk. |
| L-3 | `reconcileCampaign` loads a campaign by id with no tenant predicate | `src/lib/campaign-queue.ts:206` | Latent cross-tenant read/write; safe today only because callers are system-internal. |
| L-4 | Webhook/media failures swallowed with bare `catch {}` | `src/lib/webhook.ts:294-298`, `:370-374`; `src/modules/whatsapp/message-adapter.ts:73` | Lost event delivery and lost media persistence with no log, metric, or retry — invisible data loss. |
| L-5 | `forgot-password` reports success when email delivery is impossible | `src/lib/password-reset.ts:20-22`, `:69-78` | Users are locked out with no signal; operators only see a server log. |
| L-6 | N+1 per-recipient queries inside the broadcast send loop | `src/lib/broadcast-queue.ts:151-160` (+ per-recipient `requireEntitlement` at `:210`) | ~8 sequential round-trips per recipient — ≈40k queries for a 5,000-recipient broadcast. |
| L-7 | Idempotency TTL is never enforced and expired records are never purged | `src/lib/message-job-service.ts:87`, `:174` | The documented 7-day key reuse is not honored; the table grows without bound. |
| L-8 | Auto-reply throttle counter is consumed before the enqueue can succeed | `src/lib/autoreply-queue.ts:135`, `:218` | A failed enqueue still burns the contact's rate budget, silently dropping later legitimate replies. |
| L-9 | `.env.example` ships placeholder credentials that `start.sh`/`Dockerfile` auto-provision from | `.env.example:244-245`, `start.sh:110-115`, `Dockerfile:41` | **Mitigated:** `scripts/setup-admin.mjs` enforces 10-128 chars with upper+lower+digit, so the shipped placeholder is rejected and no admin is created. Cosmetic only, but the placeholder should be removed to avoid tempting an operator to weaken the policy. |

---

## Verified OK (do not re-audit)

These controls were read and found correctly implemented. Listed so the next pass does not redo
the work.

- **Outbound webhook signing** — signs `${timestamp}.${eventId}.${body}` and sends the exact signed
  bytes; no re-serialization mismatch (`webhook-transport.ts:160-173`).
- **Signature verification** — requires all headers, validates hex length, uses
  `crypto.timingSafeEqual` (no `===`), enforces a ±300 s replay window, and the previous-secret
  grace path does not weaken verification (`webhook-contract.ts:42-83`, `webhook-crypto.ts:58-71`).
- **Webhook tenant scoping** — every endpoint/delivery/token lookup is scoped by tenant; deliveries
  and logs are never fetched by id alone (`webhook-service.ts:111-165`, `247-309`).
- **Webhook secrets at rest** — AES-256-GCM with a random 12-byte IV and a validated 64-hex
  `ENCRYPTION_KEY`; the deprecated plaintext column is always written `null`
  (`webhook-crypto.ts:19-49`, `webhook-service.ts:139`). Responses expose only `hasSecret` /
  `secretVersion`; delivery-log signatures are redacted.
- **Upload validation** — magic-byte checks against the declared MIME (not the extension), MIME
  allowlist that excludes `image/svg+xml` and `text/html`, and a Busboy `fileSize` cap applied
  while buffering (`private-media-validation.ts:30-48`, `private-media-upload.ts:39-98`).
- **Object keys** — server-generated `${uuid}.${ext}` under `${tenantId}/`; `normalizeStoragePath`
  rejects `..`/empty segments and `resolvePrivateMediaPath` re-asserts containment
  (`private-media.ts:63-65`, `private-media-storage.ts:28-47`).
- **Private-media download** — tenant-scoped, SHA-256 + size verified, quarantines on mismatch,
  served as `attachment` with `X-Content-Type-Options: nosniff` (`private-media.ts:103-124`,
  `api/v1/media/[id]/route.ts:19-28`).
- **Payment-proof download** — owner/SUPERADMIN only, served with
  `Content-Security-Policy: sandbox` + `nosniff` (`payment-verifications/[id]/proof/route.ts:22-44`).
- **Legacy `/api/media/[filename]`** — blocks `..`, `/`, `\` and re-validates containment; its
  extension→Content-Type map contains no `html`/`svg` (`api/media/[filename]/route.ts:38-59`).
- **Admin authorization** — every `/api/admin/*` handler asserts `isAdmin(actor.role)`;
  `/api/users*` and `/api/settings/system` are SUPERADMIN-only.
- **No mass assignment** — registration destructures only `{ email, password, name }`; no `...body`
  spread into `prisma.create` in any auth/account path. No self-escalation of `role`/`ownerId`/
  `deviceLimit`.
- **Password-reset crypto** — 256-bit token, stored as SHA-256 and looked up by hash, 30-minute
  TTL, single-use via conditional `updateMany`, prior tokens deleted, `sessionVersion` bumped, and
  the token is never logged (`password-reset.ts:53-128`, `password-policy.ts:12-18`).
- **Session invalidation** — `getAuthenticatedUser`, the server-action guard, and socket auth all
  re-check `status === "ACTIVE"` and `sessionVersion`; role is refreshed from the DB in the `jwt`
  callback (`api-auth.ts:122`, `server-action-auth.ts:20`, `server/socket.ts:61-69`,
  `auth.config.ts:27-36`).
- **Email templates** — all user-controlled interpolations pass through `escapeHtml`; subjects are
  CRLF-stripped. No header injection (`email-notifications.ts:14-45`, `52-77`).
- **Secrets** — no hardcoded secrets in `src/`; `AUTH_SECRET` and `ENCRYPTION_KEY` have no
  fallbacks and are validated at boot; no `.env` is committed; the logger redacts token/secret keys
  (`env.ts:13`, `27-29`, `logger.ts:2-9`).
- **Integration tokens** — SHA-256 at rest, expiry/revocation/creator-status/scope checked,
  tenant-scoped (`integration-service.ts:127-142`).
- **Internal dispatch** — constant-time shared-secret comparison
  (`internal/message-dispatch/route.ts:10-21`).
- **API-key scopes fail closed** — unmapped paths return `null`, so API keys cannot reach admin
  routes (`api-scope-policy.ts:35`, `api-auth.ts:106-109`).
- **Queue claim atomicity** — message/broadcast/campaign/schedule/auto-reply claims are single
  atomic `UPDATE ... JOIN (SELECT ... LIMIT 1)` statements with the eligibility predicate repeated
  in the `WHERE`; two workers cannot claim the same row. Leases, heartbeats, and graceful-recovery
  paths exist for all queues.
- **Message idempotency** — scoped by `@@unique([tenantId, operation, idempotencyKey])`; retries
  reuse the existing job rather than reserving again.
- **Serializable transactions + P2034 retry** — used for usage, billing, campaign, and media
  state transitions.
- **Auto-reply / campaign retry bounds** — `MAX_AUTOREPLY_ATTEMPTS = 5` with capped exponential
  backoff; `MAX_CAMPAIGN_MATERIALIZE_ATTEMPTS = 8`.
- **`sticker.ts`** — `execFile` with an argument array (no shell), UUID temp paths, bounded input,
  duration cap, and a 30 s timeout.

---

## Files changed in this pass

| File | Finding |
|---|---|
| `src/lib/client-ip.ts` *(new)* | H-1 |
| `src/lib/client-ip.test.ts` *(new)* | H-1 regression coverage |
| `src/server/runtime.ts` | H-1 |
| `src/lib/rate-limit.ts` | H-1 |
| `src/lib/env.ts` | H-1 (`TRUST_PROXY`, `TRUST_PROXY_HOPS`) |
| `.env.example` | H-1 documentation |
| `src/lib/webhook.ts` | H-2, H-3 |
| `src/lib/ssrf.ts` | H-5 |
| `src/app/api/v1/media/import/route.ts` | H-5 |
| `src/lib/storage-quota.ts` | H-4 |
| `src/lib/private-media.ts` | H-4 |
| `src/lib/private-media-lifecycle.ts` | H-4 |
| `src/app/api/labels/[sessionId]/chat/[jid]/labels/route.ts` | M-1 |
| `src/lib/password-reset.ts` | M-2 |
| `src/lib/message-queue.ts` | M-3, M-7 |
| `src/worker/message-worker.ts` | M-3 |
| `src/app/api/users/[id]/route.ts` | M-6 |
| `src/lib/payment-proof.ts` | M-8 |
| `src/app/api/payment-verifications/route.ts` | M-8 |
