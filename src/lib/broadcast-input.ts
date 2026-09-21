import { z } from "zod";

const variableNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, "Invalid variable name");
const variableValueSchema = z.string().max(1000);
const recipientVariablesSchema = z.record(variableNameSchema, variableValueSchema).superRefine((variables, ctx) => {
  if (Object.keys(variables).length > 20) {
    ctx.addIssue({ code: "custom", message: "A recipient cannot contain more than 20 variables" });
  }
});
const recipientDataSchema = z.object({
  recipient: z.string().trim().min(3).max(191),
  variables: recipientVariablesSchema.default({}),
}).strict();

export const broadcastCreateSchema = z.object({
  sessionId: z.string().trim().min(1).max(191),
  name: z.string().trim().min(2).max(100).optional(),
  recipients: z.array(z.string().trim().min(3).max(191)).min(1).max(5000).optional(),
  recipientData: z.array(recipientDataSchema).min(1).max(5000).optional(),
  message: z.string().min(1).max(4096),
  mediaId: z.string().trim().min(1).max(191).optional(),
  delayMinMs: z.number().int().min(2000).max(60_000).default(10_000),
  delayMaxMs: z.number().int().min(2000).max(120_000).default(20_000),
  requireOptIn: z.boolean().default(false),
}).strict().superRefine((input, ctx) => {
  if (!input.recipients && !input.recipientData) {
    ctx.addIssue({ code: "custom", message: "recipients or recipientData is required", path: ["recipients"] });
  }
  if (input.recipients && input.recipientData) {
    ctx.addIssue({ code: "custom", message: "Use either recipients or recipientData, not both", path: ["recipientData"] });
  }
  if (input.delayMaxMs < input.delayMinMs) {
    ctx.addIssue({ code: "custom", message: "delayMaxMs must be greater than or equal to delayMinMs", path: ["delayMaxMs"] });
  }
});

export const spintaxPreviewSchema = z.object({
  message: z.string().min(1).max(4096),
  count: z.number().int().min(1).max(20).default(5),
  variables: recipientVariablesSchema.optional(),
}).strict();

export const suppressionWriteSchema = z.object({
  recipient: z.string().trim().min(3).max(191),
  reason: z.enum(["MANUAL", "ADMIN"]).default("MANUAL"),
}).strict();
