# Email delivery semantics

PesanPro's durable `EmailOutbox` is intentionally **at-least-once**.

The worker sends an SMTP message and only then marks the database row as `SENT`. If the process is terminated after the SMTP server accepts the message but before the database commit completes, the expired lease is retried and the recipient can receive a duplicate email.

To reduce accidental duplication, PesanPro uses a deterministic `Message-ID` derived from each outbox `eventKey`. SMTP providers may use this as a deduplication hint, but SMTP itself does not provide an exactly-once guarantee.

Operational policy:

- keep email templates idempotent and safe if seen twice;
- do not trigger irreversible business actions from email receipt;
- monitor the `EMAIL_WORKER` runtime heartbeat whenever SMTP is configured;
- monitor pending/dead-letter email queue health in System Monitor;
- retry delivery failures through the durable outbox;
- password-reset emails are sent directly through SMTP because persisting their raw reset token in the current outbox would weaken secret handling.

If a future notification requires provable provider-side idempotency, use a delivery provider/API with an idempotency contract rather than assuming exactly-once SMTP delivery.
