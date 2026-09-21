import moment from "moment-timezone";
import { describe, expect, it } from "vitest";
import {
  evaluateAutoReplyRule,
  isAutoReplyScheduleActive,
  selectAutoReplyRule,
  type AutoReplyRulePolicy,
  validateSafeRegexPattern,
} from "./autoreply-policy";

function rule(overrides: Partial<AutoReplyRulePolicy> = {}): AutoReplyRulePolicy {
  return {
    id: "rule-1",
    keyword: "halo",
    matchType: "EXACT",
    triggerType: "ALL",
    priority: 100,
    timezone: "Asia/Jakarta",
    activeDays: null,
    activeStartTime: null,
    activeEndTime: null,
    isEnabled: true,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("auto-reply deterministic policy", () => {
  it.each([
    ["EXACT", "  HALO  ", true],
    ["CONTAINS", "boleh halo admin", true],
    ["STARTS_WITH", "halo admin", true],
    ["EXACT", "halo admin", false],
  ] as const)("matches %s rules", (matchType, text, matched) => {
    expect(evaluateAutoReplyRule(rule({ matchType }), { text, isGroup: false }).matched).toBe(matched);
  });

  it("uses fallback only when no regular rule matches", () => {
    const fallback = rule({ id: "fallback", keyword: "", matchType: "FALLBACK", priority: 999 });
    const exact = rule({ id: "exact", priority: 1 });
    expect(selectAutoReplyRule([fallback, exact], { text: "halo", isGroup: false }).rule?.id).toBe("exact");
    expect(selectAutoReplyRule([fallback, exact], { text: "lain", isGroup: false }).rule?.id).toBe("fallback");
  });

  it("selects by priority then oldest creation and stable id", () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const selected = selectAutoReplyRule([
      rule({ id: "low", priority: 1 }),
      rule({ id: "b", priority: 200, createdAt: old }),
      rule({ id: "a", priority: 200, createdAt: old }),
    ], { text: "halo", isGroup: false });
    expect(selected.rule?.id).toBe("a");
    expect(selected.conflictRuleIds).toEqual(["b"]);
  });

  it("enforces private and group audiences", () => {
    expect(evaluateAutoReplyRule(rule({ triggerType: "GROUP" }), { text: "halo", isGroup: false }).reasonCode).toBe("AUDIENCE_MISMATCH");
    expect(evaluateAutoReplyRule(rule({ triggerType: "PRIVATE" }), { text: "halo", isGroup: true }).reasonCode).toBe("AUDIENCE_MISMATCH");
  });

  it("supports timezone schedules that cross midnight", () => {
    const scheduled = rule({ activeDays: [1], activeStartTime: "22:00", activeEndTime: "02:00" });
    expect(isAutoReplyScheduleActive(scheduled, moment.tz("2026-08-31T23:30", scheduled.timezone).toDate())).toBe(true);
    expect(isAutoReplyScheduleActive(scheduled, moment.tz("2026-09-01T01:30", scheduled.timezone).toDate())).toBe(true);
    expect(isAutoReplyScheduleActive(scheduled, moment.tz("2026-09-01T10:00", scheduled.timezone).toDate())).toBe(false);
  });

  it("rejects dangerous regex while allowing a bounded subset", () => {
    expect(validateSafeRegexPattern("^order-[0-9]{6}$").test("order-123456")).toBe(true);
    for (const pattern of ["(a+)+$", "a.*b", "(foo|bar)", "(a)\\1", "(?=admin)", "a{1,100}"]) {
      expect(() => validateSafeRegexPattern(pattern)).toThrow();
    }
  });

  it("never evaluates disabled, deleted, or out-of-schedule rules", () => {
    expect(evaluateAutoReplyRule(rule({ isEnabled: false }), { text: "halo", isGroup: false }).eligible).toBe(false);
    expect(evaluateAutoReplyRule(rule({ deletedAt: new Date() }), { text: "halo", isGroup: false }).eligible).toBe(false);
    expect(evaluateAutoReplyRule(rule({ activeDays: [7] }), { text: "halo", isGroup: false, now: moment.tz("2026-08-31T12:00", "Asia/Jakarta").toDate() }).reasonCode).toBe("OUTSIDE_SCHEDULE");
  });
});
