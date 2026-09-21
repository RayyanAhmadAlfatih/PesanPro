import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { enqueueMessage } from "@/lib/message-job-service";

const schema = z.object({
  sessionId: z.string().min(1).max(191),
  recipient: z.string().min(3).max(191),
  text: z.string().trim().min(1).max(4096),
}).strict();

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = schema.parse(await request.json());
    const result = await enqueueMessage({
      actor: { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      operation: "messages.text.create",
      idempotencyKey: requireIdempotencyKey(request.headers),
      sessionPublicId: input.sessionId,
      recipient: input.recipient,
      type: "TEXT",
      text: input.text,
    });
    return apiV1Success(requestId, result.job, result.idempotent ? 200 : 202, { idempotent: result.idempotent });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
