import { IntegrationType } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { buildDefaultFormMessage, formFieldsSchema, formMetadata, normalizeFormFields } from "@/lib/form-integration";
import { enqueueIntegrationMessage, readIntegrationToken } from "@/lib/integration-service";

const payloadSchema = z.object({
  responseId: z.string().trim().min(1).max(191),
  formId: z.string().trim().max(191).optional(),
  formTitle: z.string().trim().max(200).optional(),
  submittedAt: z.string().datetime().optional(),
  respondentEmail: z.string().trim().email().max(320).optional(),
  recipient: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(4096).optional(),
  fields: formFieldsSchema.optional(),
}).strict().superRefine((value, context) => {
  if (!value.message && !value.fields) context.addIssue({ code: "custom", path: ["fields"], message: "Provide message or structured fields" });
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const payload = payloadSchema.parse(await request.json());
    const fields = normalizeFormFields(payload.fields ?? {});
    const data = await enqueueIntegrationMessage({
      rawToken: readIntegrationToken(request.headers),
      expectedType: IntegrationType.GOOGLE_FORMS,
      idempotencyKey: requireIdempotencyKey(request.headers),
      requestId,
      headers: request.headers,
      message: {
        recipient: payload.recipient ?? "",
        message: payload.message ?? buildDefaultFormMessage("Google Forms", payload.formTitle, fields),
        sourceId: payload.responseId,
        metadata: formMetadata(fields, { formId: payload.formId, formTitle: payload.formTitle, submittedAt: payload.submittedAt, respondentEmail: payload.respondentEmail, provider: "google-forms" }),
      },
    });
    return apiV1Success(requestId, data, 202);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
