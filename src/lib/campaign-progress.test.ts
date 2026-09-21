import { describe, expect, it } from "vitest";
import { calculateCampaignProgress, selectCampaignDevice } from "./campaign-progress";

describe("campaign progress reconciliation", () => {
  it("uses message job delivery state over the handoff snapshot", () => {
    const result = calculateCampaignProgress([
      { status: "ENQUEUED", messageJob: { status: "READ" } },
      { status: "ENQUEUED", messageJob: { status: "DELIVERED" } },
      { status: "ENQUEUED", messageJob: { status: "SENT" } },
      { status: "PENDING", messageJob: null },
    ]);
    expect(result).toMatchObject({ read: 1, delivered: 1, sent: 1, queued: 1 });
  });

  it("tracks unsubscribe as a skipped submetric without losing the skipped total", () => {
    const result = calculateCampaignProgress([
      { status: "SKIPPED", safeErrorCode: "RECIPIENT_UNSUBSCRIBED" },
      { status: "SKIPPED", safeErrorCode: "OPT_IN_REQUIRED" },
      { status: "FAILED" },
      { status: "CANCELLED" },
    ]);
    expect(result).toMatchObject({ skipped: 2, unsubscribed: 1, failed: 1, cancelled: 1 });
  });

  it("always prefers a connected primary device", () => {
    expect(selectCampaignDevice({
      primary: { id: "primary", sessionId: "p", status: "CONNECTED" },
      fallback: { id: "fallback", sessionId: "f", status: "CONNECTED" },
      fallbackPolicy: "USE_FALLBACK",
    })?.id).toBe("primary");
  });

  it("uses fallback only under the explicit policy", () => {
    const input = { primary: { id: "primary", sessionId: "p", status: "STOPPED" }, fallback: { id: "fallback", sessionId: "f", status: "CONNECTED" } };
    expect(selectCampaignDevice({ ...input, fallbackPolicy: "PRIMARY_ONLY" })).toBeNull();
    expect(selectCampaignDevice({ ...input, fallbackPolicy: "USE_FALLBACK" })?.id).toBe("fallback");
  });
});
