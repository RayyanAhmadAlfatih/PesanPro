import { IntegrationType } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { enqueueIntegrationMessage, readIntegrationToken } from "@/lib/integration-service";

const payloadSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform(String),
  event: z.enum(["order.created", "order.updated", "order.paid", "order.completed", "order.cancelled", "order.refunded"]),
  recipient: z.string().trim().min(7).max(100),
  message: z.string().trim().min(1).max(4096),
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const payload = payloadSchema.parse(await request.json());
    const data = await enqueueIntegrationMessage({
      rawToken: readIntegrationToken(request.headers),
      expectedType: IntegrationType.WOOCOMMERCE,
      idempotencyKey: requireIdempotencyKey(request.headers),
      requestId,
      headers: request.headers,
      message: { recipient: payload.recipient, message: payload.message, sourceId: payload.orderId, metadata: { event: payload.event } },
    });
    return apiV1Success(requestId, data, 202);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

