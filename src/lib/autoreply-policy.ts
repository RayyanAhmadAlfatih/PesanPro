import moment from "moment-timezone";
import type { AutoReplyMatchType, AutoReplyTriggerType } from "@prisma/client";

export const MAX_AUTOREPLY_INPUT_LENGTH = 4096;
export const MAX_SAFE_REGEX_LENGTH = 100;

export type AutoReplyRulePolicy = {
  id: string;
  keyword: string;
  matchType: AutoReplyMatchType;
  triggerType: AutoReplyTriggerType;
  priority: number;
  timezone: string;
  activeDays: unknown;
  activeStartTime: string | null;
  activeEndTime: string | null;
  isEnabled: boolean;
  deletedAt: Date | null;
  createdAt: Date;
};

export type AutoReplyEvaluation = {
  ruleId: string;
  eligible: boolean;
  matched: boolean;
  reasonCode: string;
};

function stripEscapesAndCharacterClasses(pattern: string) {
  return pattern.replace(/\\./g, "").replace(/\[(?:\\.|[^\]\\])*\]/g, "");
}

export function validateSafeRegexPattern(pattern: string) {
  if (!pattern || pattern.length > MAX_SAFE_REGEX_LENGTH) {
    throw new Error(`Regex must contain 1-${MAX_SAFE_REGEX_LENGTH} characters`);
  }
  const syntax = stripEscapesAndCharacterClasses(pattern);
  if (syntax.includes("(?") || /\\[1-9]/.test(pattern)) {
    throw new Error("Lookaround, named groups, and backreferences are not allowed");
  }
  if (/[()|+*]/.test(syntax)) {
    throw new Error("Groups, alternation, and unbounded quantifiers are not allowed");
  }
  for (const match of syntax.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    if (match[2] !== undefined || Number(match[1]) > 20) {
      throw new Error("Only fixed quantifiers up to {20} are allowed");
    }
  }
  try {
    return new RegExp(pattern, "iu");
  } catch {
    throw new Error("Regex pattern is invalid");
  }
}

export function normalizeAutoReplyText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("id-ID").slice(0, MAX_AUTOREPLY_INPUT_LENGTH);
}

function parseActiveDays(value: unknown) {
  if (!Array.isArray(value)) return null;
  const days = value.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length > 0 ? new Set(days) : null;
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isAutoReplyScheduleActive(rule: AutoReplyRulePolicy, now = new Date()) {
  if (!moment.tz.zone(rule.timezone)) return false;
  const activeDays = parseActiveDays(rule.activeDays);
  const local = moment(now).tz(rule.timezone);
  const currentMinute = local.hour() * 60 + local.minute();
  const start = rule.activeStartTime ? parseClock(rule.activeStartTime) : null;
  const end = rule.activeEndTime ? parseClock(rule.activeEndTime) : null;

  if (start === null || end === null) {
    return !activeDays || activeDays.has(local.isoWeekday());
  }
  if (start === end) {
    return !activeDays || activeDays.has(local.isoWeekday());
  }
  if (start < end) {
    return (!activeDays || activeDays.has(local.isoWeekday())) && currentMinute >= start && currentMinute < end;
  }

  if (currentMinute >= start) return !activeDays || activeDays.has(local.isoWeekday());
  const previousDay = local.clone().subtract(1, "day").isoWeekday();
  return currentMinute < end && (!activeDays || activeDays.has(previousDay));
}

export function evaluateAutoReplyRule(
  rule: AutoReplyRulePolicy,
  input: { text: string; isGroup: boolean; now?: Date },
): AutoReplyEvaluation {
  if (!rule.isEnabled || rule.deletedAt) return { ruleId: rule.id, eligible: false, matched: false, reasonCode: "RULE_DISABLED" };
  if (rule.triggerType === "GROUP" && !input.isGroup) return { ruleId: rule.id, eligible: false, matched: false, reasonCode: "AUDIENCE_MISMATCH" };
  if (rule.triggerType === "PRIVATE" && input.isGroup) return { ruleId: rule.id, eligible: false, matched: false, reasonCode: "AUDIENCE_MISMATCH" };
  if (!isAutoReplyScheduleActive(rule, input.now)) return { ruleId: rule.id, eligible: false, matched: false, reasonCode: "OUTSIDE_SCHEDULE" };

  const incoming = normalizeAutoReplyText(input.text);
  const keyword = normalizeAutoReplyText(rule.keyword);
  let matched = false;
  try {
    if (rule.matchType === "EXACT") matched = incoming === keyword;
    if (rule.matchType === "CONTAINS") matched = keyword.length > 0 && incoming.includes(keyword);
    if (rule.matchType === "STARTS_WITH") matched = keyword.length > 0 && incoming.startsWith(keyword);
    if (rule.matchType === "REGEX") matched = validateSafeRegexPattern(rule.keyword).test(input.text.slice(0, MAX_AUTOREPLY_INPUT_LENGTH));
    if (rule.matchType === "FALLBACK") matched = true;
  } catch {
    return { ruleId: rule.id, eligible: false, matched: false, reasonCode: "UNSAFE_REGEX" };
  }
  return { ruleId: rule.id, eligible: true, matched, reasonCode: matched ? "MATCHED" : "NO_MATCH" };
}

function compareRules(a: AutoReplyRulePolicy, b: AutoReplyRulePolicy) {
  return b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

export function selectAutoReplyRule(
  rules: AutoReplyRulePolicy[],
  input: { text: string; isGroup: boolean; now?: Date },
) {
  const evaluations = rules.map((rule) => ({ rule, evaluation: evaluateAutoReplyRule(rule, input) }));
  const regular = evaluations.filter(({ rule, evaluation }) => rule.matchType !== "FALLBACK" && evaluation.matched).sort((a, b) => compareRules(a.rule, b.rule));
  const fallback = evaluations.filter(({ rule, evaluation }) => rule.matchType === "FALLBACK" && evaluation.matched).sort((a, b) => compareRules(a.rule, b.rule));
  const candidates = regular.length > 0 ? regular : fallback;
  const selected = candidates[0]?.rule ?? null;
  const conflicts = selected
    ? candidates.filter(({ rule }) => rule.id !== selected.id && rule.priority === selected.priority).map(({ rule }) => rule.id)
    : [];
  return {
    rule: selected,
    evaluations: evaluations.map(({ evaluation }) => evaluation),
    conflictRuleIds: conflicts,
  };
}
