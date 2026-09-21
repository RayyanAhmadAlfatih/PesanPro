import { IntegrationType } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { buildDefaultFormMessage, formFieldsSchema, formMetadata, normalizeFormFields } from "@/lib/form-integration";
import { enqueueIntegrationMessage, readIntegrationToken } from "@/lib/integration-service";

const payloadSchema = z.object({
  submissionId: z.string().trim().min(1).max(191),
  formId: z.union([z.string(), z.number().int().nonnegative()]).transform(String),
  formTitle: z.string().trim().max(200).optional(),
  submittedAt: z.string().datetime().optional(),
  site: z.string().url().max(2048),
  recipient: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(4096).optional(),
  fields: formFieldsSchema,
}).strict();

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const payload = payloadSchema.parse(await request.json());
    const fields = normalizeFormFields(payload.fields);
    const data = await enqueueIntegrationMessage({
      rawToken: readIntegrationToken(request.headers),
      expectedType: IntegrationType.CONTACT_FORM_7,
      idempotencyKey: requireIdempotencyKey(request.headers),
      requestId,
      headers: request.headers,
      message: {
        recipient: payload.recipient ?? "",
        message: payload.message ?? buildDefaultFormMessage("Contact Form 7", payload.formTitle, fields),
        sourceId: payload.submissionId,
        metadata: formMetadata(fields, { formId: payload.formId, formTitle: payload.formTitle, submittedAt: payload.submittedAt, site: payload.site, provider: "contact-form-7" }),
      },
    });
    return apiV1Success(requestId, data, 202);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
