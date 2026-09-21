import moment from "moment-timezone";
import { z } from "zod";
import { validateSafeRegexPattern } from "./autoreply-policy";

const id = z.string().trim().min(1).max(191);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm format");

export const autoReplyWriteSchema = z.object({
  sessionId: id,
  name: z.string().trim().min(2).max(100).optional(),
  keyword: z.string().max(100),
  matchType: z.enum(["EXACT", "CONTAINS", "STARTS_WITH", "REGEX", "FALLBACK"]),
  response: z.string().trim().max(4096).optional(),
  mediaId: id.optional(),
  triggerType: z.enum(["ALL", "GROUP", "PRIVATE"]).default("ALL"),
  priority: z.number().int().min(0).max(10_000).default(100),
  timezone: z.string().trim().min(1).max(100).default("Asia/Jakarta"),
  activeDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  activeStartTime: clock.optional(),
  activeEndTime: clock.optional(),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(30),
  rateLimitCount: z.number().int().min(1).max(100).default(5),
  rateLimitWindowSeconds: z.number().int().min(10).max(86_400).default(60),
  maxChainDepth: z.number().int().min(1).max(20).default(3),
  isEnabled: z.boolean().default(true),
}).strict().superRefine((input, context) => {
  if (input.matchType !== "FALLBACK" && !input.keyword.trim()) {
    context.addIssue({ code: "custom", path: ["keyword"], message: "Keyword is required unless matchType is FALLBACK" });
  }
  if (input.matchType === "FALLBACK" && input.keyword.trim()) {
    context.addIssue({ code: "custom", path: ["keyword"], message: "Fallback rules must use an empty keyword" });
  }
  if (!input.response && !input.mediaId) {
    context.addIssue({ code: "custom", path: ["response"], message: "Response or mediaId is required" });
  }
  if (Boolean(input.activeStartTime) !== Boolean(input.activeEndTime)) {
    context.addIssue({ code: "custom", path: [input.activeStartTime ? "activeEndTime" : "activeStartTime"], message: "Both schedule times are required" });
  }
  if (input.activeDays && new Set(input.activeDays).size !== input.activeDays.length) {
    context.addIssue({ code: "custom", path: ["activeDays"], message: "Schedule days must be unique" });
  }
  if (!moment.tz.zone(input.timezone)) {
    context.addIssue({ code: "custom", path: ["timezone"], message: "Timezone must be a valid IANA timezone" });
  }
  if (input.matchType === "REGEX") {
    try { validateSafeRegexPattern(input.keyword); } catch (error) {
      context.addIssue({ code: "custom", path: ["keyword"], message: error instanceof Error ? error.message : "Regex is unsafe" });
    }
  }
});

export const autoReplyPreviewSchema = z.object({
  sessionId: id,
  text: z.string().max(4096),
  isGroup: z.boolean().default(false),
  at: z.coerce.date().optional(),
}).strict();

export type AutoReplyWriteInput = z.infer<typeof autoReplyWriteSchema>;
export type AutoReplyPreviewInput = z.infer<typeof autoReplyPreviewSchema>;

export function parseAutoReplyBody(value: unknown, sessionId?: string) {
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return autoReplyWriteSchema.parse({
    sessionId: sessionId ?? body.sessionId,
    name: body.name,
    keyword: body.keyword,
    matchType: body.matchType,
    response: typeof body.response === "string" ? body.response : undefined,
    mediaId: body.mediaId,
    triggerType: body.triggerType,
    priority: body.priority,
    timezone: body.timezone,
    activeDays: body.activeDays,
    activeStartTime: body.activeStartTime,
    activeEndTime: body.activeEndTime,
    cooldownSeconds: body.cooldownSeconds,
    rateLimitCount: body.rateLimitCount,
    rateLimitWindowSeconds: body.rateLimitWindowSeconds,
    maxChainDepth: body.maxChainDepth,
    isEnabled: body.isEnabled,
  });
}
