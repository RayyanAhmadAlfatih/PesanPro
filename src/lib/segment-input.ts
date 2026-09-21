import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const source = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_.-]+$/).transform((value) => value.toUpperCase());

export const segmentAttributeSchema = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
  operator: z.enum(["EQUALS", "CONTAINS", "EXISTS"]),
  value: z.string().max(191).optional(),
}).strict().superRefine((input, context) => {
  if (input.operator !== "EXISTS" && input.value === undefined) {
    context.addIssue({ code: "custom", path: ["value"], message: "value is required for this operator" });
  }
});

export const segmentDefinitionSchema = z.object({
  consentStatuses: z.array(z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"])).max(3).default([]),
  tagIds: z.array(id).max(10).default([]),
  labelIds: z.array(id).max(10).default([]),
  sources: z.array(source).max(10).default([]),
  lastActivityFrom: z.string().datetime({ offset: true }).optional(),
  lastActivityTo: z.string().datetime({ offset: true }).optional(),
  attributes: z.array(segmentAttributeSchema).max(10).default([]),
}).strict().superRefine((input, context) => {
  if (input.lastActivityFrom && input.lastActivityTo && input.lastActivityFrom > input.lastActivityTo) {
    context.addIssue({ code: "custom", path: ["lastActivityTo"], message: "lastActivityTo must not be before lastActivityFrom" });
  }
});

export const segmentWriteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  definition: segmentDefinitionSchema,
}).strict();

export const segmentPreviewSchema = z.object({
  sessionId: id,
  definition: segmentDefinitionSchema,
  sampleLimit: z.number().int().min(0).max(25).default(10),
}).strict();

export const contactTagWriteSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
}).strict();

export const contactProfileWriteSchema = z.object({
  source: source.optional(),
  consentStatus: z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]).optional(),
  consentSource: z.string().trim().min(1).max(100).optional(),
  customAttributes: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,39}$/), z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()])).optional(),
  tagIds: z.array(id).max(25).optional(),
}).strict().refine((input) => Object.keys(input.customAttributes ?? {}).length <= 25, {
  message: "customAttributes may contain at most 25 keys",
  path: ["customAttributes"],
});

export type SegmentDefinitionInput = z.infer<typeof segmentDefinitionSchema>;
