import { describe, expect, it } from "vitest";

import { buildWebhookEventKey } from "./webhook-outbox";

describe("webhook event keys", () => {
  it("collapses store and queue message.status payloads for the same status", () => {
    const store = buildWebhookEventKey(
      "message.status",
      "qa-b-session",
      { keyId: "PP1", remoteJid: "154077874929843@lid", status: "READ" },
      "message.status:PP1:READ",
    );
    const queue = buildWebhookEventKey(
      "message.status",
      "qa-b-session",
      { jobId: "job-1", messageId: "PP1", recipient: "6283877315731@s.whatsapp.net", status: "READ" },
      "message.status:PP1:READ",
    );

    expect(store).toBe(queue);
  });

  it("keeps different statuses of the same message apart", () => {
    const delivered = buildWebhookEventKey("message.status", "qa-b-session", {}, "message.status:PP1:DELIVERED");
    const read = buildWebhookEventKey("message.status", "qa-b-session", {}, "message.status:PP1:READ");

    expect(delivered).not.toBe(read);
  });
});
