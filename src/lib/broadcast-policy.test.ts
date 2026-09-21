import { describe, expect, it } from "vitest";
import { deterministicBroadcastDelay, nextBroadcastStatus, prepareRecipientSnapshots } from "./broadcast-policy";
import { isUnsubscribeText } from "./suppression";

describe("broadcast safety policy", () => {
  it("normalizes, deduplicates, and excludes groups", () => {
    const snapshots = prepareRecipientSnapshots(["+62 8123456789", "628123456789", "120363000000@g.us"]);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ jid: "628123456789@s.whatsapp.net", status: "PENDING" });
    expect(snapshots[1]).toMatchObject({ status: "SKIPPED", safeErrorCode: "GROUP_RECIPIENT_EXCLUDED" });
  });

  it("uses stable bounded jitter across restarts", () => {
    const first = deterministicBroadcastDelay("seed", 4, 2000, 5000);
    expect(deterministicBroadcastDelay("seed", 4, 2000, 5000)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(2000);
    expect(first).toBeLessThanOrEqual(5000);
  });

  it("detects exact unsubscribe commands without substring false positives", () => {
    expect(isUnsubscribeText(" STOP! ")).toBe(true);
    expect(isUnsubscribeText("berhenti")).toBe(true);
    expect(isUnsubscribeText("do not stop now")).toBe(false);
  });

  it("completes only after no pending snapshot remains", () => {
    expect(nextBroadcastStatus(1)).toBe("RUNNING");
    expect(nextBroadcastStatus(0)).toBe("COMPLETED");
  });
});
