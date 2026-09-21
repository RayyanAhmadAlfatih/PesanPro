import { z } from "zod";

const id = z.string().trim().min(1).max(191);

export const campaignWriteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  primarySessionId: id,
  fallbackSessionId: id.optional(),
  fallbackPolicy: z.enum(["PRIMARY_ONLY", "USE_FALLBACK"]).default("PRIMARY_ONLY"),
  segmentId: id,
  message: z.string().min(1).max(4096),
  mediaId: id.optional(),
  delayMinMs: z.number().int().min(2000).max(60_000).default(10_000),
  delayMaxMs: z.number().int().min(2000).max(120_000).default(20_000),
  requireOptIn: z.boolean().default(false),
}).strict().superRefine((input, context) => {
  if (input.delayMaxMs < input.delayMinMs) {
    context.addIssue({ code: "custom", path: ["delayMaxMs"], message: "delayMaxMs must be greater than or equal to delayMinMs" });
  }
  if (input.fallbackPolicy === "USE_FALLBACK" && !input.fallbackSessionId) {
    context.addIssue({ code: "custom", path: ["fallbackSessionId"], message: "fallbackSessionId is required by the fallback policy" });
  }
  if (input.fallbackSessionId && input.fallbackSessionId === input.primarySessionId) {
    context.addIssue({ code: "custom", path: ["fallbackSessionId"], message: "fallback device must be different from the primary device" });
  }
});

export const campaignActivationSchema = z.object({
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
}).strict().superRefine((input, context) => {
  if (Boolean(input.localDateTime) !== Boolean(input.timezone)) {
    context.addIssue({ code: "custom", path: [input.localDateTime ? "timezone" : "localDateTime"], message: "localDateTime and timezone must be provided together" });
  }
});

export type CampaignWriteInput = z.infer<typeof campaignWriteSchema>;
