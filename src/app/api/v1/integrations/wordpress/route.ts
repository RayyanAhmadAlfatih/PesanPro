import { IntegrationType } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { enqueueIntegrationMessage, readIntegrationToken } from "@/lib/integration-service";

const payloadSchema = z.object({
  submissionId: z.string().trim().min(1).max(191),
  recipient: z.string().trim().min(7).max(100),
  message: z.string().trim().min(1).max(4096),
  site: z.string().url().max(2048).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const payload = payloadSchema.parse(await request.json());
    const data = await enqueueIntegrationMessage({
      rawToken: readIntegrationToken(request.headers),
      expectedType: IntegrationType.WORDPRESS,
      idempotencyKey: requireIdempotencyKey(request.headers),
      requestId,
      headers: request.headers,
      message: { recipient: payload.recipient, message: payload.message, sourceId: payload.submissionId, metadata: { site: payload.site ?? null } },
    });
    return apiV1Success(requestId, data, 202);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

