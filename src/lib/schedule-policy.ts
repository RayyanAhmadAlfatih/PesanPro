import { CronExpressionParser } from "cron-parser";
import moment from "moment-timezone";
import { MessageJobError } from "./message-job-errors";

const LOCAL_DATE_TIME_FORMATS = ["YYYY-MM-DDTHH:mm", "YYYY-MM-DDTHH:mm:ss"];

export function validateScheduleTimezone(timezone: string) {
  const normalized = timezone.trim();
  if (!moment.tz.zone(normalized)) {
    throw new MessageJobError("INVALID_TIMEZONE", "Timezone must be a valid IANA timezone", 422, false);
  }
  return normalized;
}

export function parseScheduleLocalDateTime(value: string, timezone: string) {
  const validTimezone = validateScheduleTimezone(timezone);
  const parsed = moment.tz(value, LOCAL_DATE_TIME_FORMATS, true, validTimezone);
  if (!parsed.isValid()) {
    throw new MessageJobError("INVALID_LOCAL_TIME", "Local date and time is invalid", 422, false);
  }
  const expected = value.length === 16 ? value : value.slice(0, 19);
  const actual = parsed.format(value.length === 16 ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DDTHH:mm:ss");
  if (actual !== expected) {
    throw new MessageJobError("NONEXISTENT_LOCAL_TIME", "Local time does not exist because of a timezone transition", 422, false);
  }
  return parsed.toDate();
}

export function validateCronExpression(expression: string, timezone: string, currentDate = new Date()) {
  const normalized = expression.trim().replace(/\s+/g, " ");
  if (normalized.length < 9 || normalized.length > 100 || normalized.split(" ").length !== 5) {
    throw new MessageJobError("INVALID_CRON", "Cron expression must contain exactly five fields", 422, false);
  }
  try {
    CronExpressionParser.parse(normalized, { currentDate, tz: validateScheduleTimezone(timezone) }).next();
  } catch {
    throw new MessageJobError("INVALID_CRON", "Cron expression is invalid", 422, false);
  }
  return normalized;
}

export function nextCronOccurrence(expression: string, timezone: string, after: Date) {
  const cron = validateCronExpression(expression, timezone, after);
  return CronExpressionParser.parse(cron, { currentDate: after, tz: timezone }).next().toDate();
}

export function occurrenceKey(version: number, scheduledFor: Date) {
  return `v${Math.max(1, version)}:${scheduledFor.toISOString()}`;
}

export function isMissedRun(scheduledFor: Date, now: Date, graceSeconds: number) {
  const graceMs = Math.max(0, Math.floor(graceSeconds)) * 1000;
  return now.getTime() - scheduledFor.getTime() > graceMs;
}
