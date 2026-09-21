import { z } from "zod";

export const scheduleWriteSchema = z.object({
  sessionId: z.string().trim().min(1).max(191),
  recipient: z.string().trim().min(3).max(191),
  text: z.string().max(4096).optional(),
  mediaId: z.string().trim().min(1).max(191).optional(),
  localDateTime: z.string().trim().min(16).max(19),
  timezone: z.string().trim().min(1).max(100),
  kind: z.enum(["ONE_TIME", "RECURRING"]).default("ONE_TIME"),
  cronExpression: z.string().trim().max(100).optional(),
  missedRunPolicy: z.enum(["SEND_LATE", "SKIP", "CANCEL"]).default("SEND_LATE"),
  misfireGraceSeconds: z.number().int().min(0).max(86_400).default(300),
}).strict().refine((input) => Boolean(input.text?.trim() || input.mediaId), {
  message: "Text or mediaId is required",
  path: ["text"],
}).refine((input) => input.kind !== "RECURRING" || Boolean(input.cronExpression), {
  message: "cronExpression is required for recurring schedules",
  path: ["cronExpression"],
});

export const legacyScheduleInputSchema = z.object({
  jid: z.string().trim().min(1).max(191),
  content: z.string().max(4096).nullish(),
  sendAt: z.string().trim().min(16).max(100),
  timezone: z.string().trim().max(100).optional(),
  mediaId: z.string().trim().max(191).nullish(),
  mediaUrl: z.string().trim().max(2048).nullish(),
  mediaType: z.string().trim().max(100).nullish(),
  cronExpression: z.string().trim().max(100).nullish(),
  recurrenceRule: z.string().max(10_000).nullish(),
  missedRunPolicy: z.enum(["SEND_LATE", "SKIP", "CANCEL"]).optional(),
  misfireGraceSeconds: z.number().int().min(0).max(86_400).optional(),
});
