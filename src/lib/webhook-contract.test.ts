import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookRequest } from "./webhook-contract";

describe("webhook signature contract", () => {
  const secret = "whsec_abcdefghijklmnopqrstuvwxyz_1234567890";
  const body = JSON.stringify({ id: "wh_evt_12345678", event: "test" });
  const eventId = "wh_evt_12345678";
  const timestamp = "1788048000";

  function headers(signature = signWebhookBody(secret, timestamp, eventId, body)) {
    return {
      "x-pesanpro-event-id": eventId,
      "x-pesanpro-timestamp": timestamp,
      "x-pesanpro-signature": `v1=${signature}`,
    };
  }

  it("accepts an authentic payload inside the timestamp window", () => {
    expect(verifyWebhookRequest({ body, secret, headers: headers(), nowMs: 1_788_048_000_000 })).toEqual({ valid: true, eventId, timestamp: 1_788_048_000 });
  });

  it("rejects a fake signature", () => {
    expect(verifyWebhookRequest({ body, secret, headers: headers("0".repeat(64)), nowMs: 1_788_048_000_000 })).toEqual({ valid: false, code: "INVALID_SIGNATURE" });
  });

  it("rejects a modified payload", () => {
    expect(verifyWebhookRequest({ body: `${body} `, secret, headers: headers(), nowMs: 1_788_048_000_000 })).toEqual({ valid: false, code: "INVALID_SIGNATURE" });
  });

  it("rejects an old timestamp before consulting replay storage", () => {
    expect(verifyWebhookRequest({ body, secret, headers: headers(), nowMs: 1_788_048_601_000, isReplay: () => false })).toEqual({ valid: false, code: "STALE_TIMESTAMP" });
  });

  it("rejects a repeated event ID after signature verification", () => {
    expect(verifyWebhookRequest({ body, secret, headers: headers(), nowMs: 1_788_048_000_000, isReplay: (id) => id === eventId })).toEqual({ valid: false, code: "REPLAY_DETECTED" });
  });
});

