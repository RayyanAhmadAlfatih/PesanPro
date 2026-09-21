import { describe, expect, it } from "vitest";
import { auditRetentionBoundary } from "./audit-retention";

describe("audit retention policy", () => {
  it("uses a deterministic UTC duration boundary", () => {
    expect(auditRetentionBoundary(30, new Date("2026-09-05T00:00:00Z"))).toEqual(new Date("2026-08-06T00:00:00Z"));
  });

  it("rejects unsafe or unbounded retention", () => {
    expect(() => auditRetentionBoundary(29)).toThrow();
    expect(() => auditRetentionBoundary(3651)).toThrow();
    expect(() => auditRetentionBoundary(30.5)).toThrow();
  });
});
