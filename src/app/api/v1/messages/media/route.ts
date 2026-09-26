import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { enqueueMessage } from "@/lib/message-job-service";

const schema = z.object({
  sessionId: z.string().min(1).max(191),
  recipient: z.string().min(3).max(191),
  mediaId: z.string().min(1).max(191).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  videoUrl: z.string().url().max(2048).optional(),
  audioUrl: z.string().url().max(2048).optional(),
  documentUrl: z.string().url().max(2048).optional(),
  type: z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"]),
  caption: z.string().trim().max(4096).optional(),
  fileName: z.string().trim().min(1).max(191).optional(),
  mimeType: z.string().trim().min(1).max(191).optional(),
}).strict().superRefine((input, context) => {
  const urls = [input.imageUrl, input.videoUrl, input.audioUrl, input.documentUrl].filter(Boolean);
  if (Number(Boolean(input.mediaId)) + urls.length !== 1) {
    context.addIssue({ code: "custom", message: "Provide exactly one mediaId or matching media URL" });
    return;
  }
  const expectedUrl = input.type === "IMAGE" ? input.imageUrl
    : input.type === "VIDEO" ? input.videoUrl
      : input.type === "AUDIO" ? input.audioUrl
        : input.documentUrl;
  if (urls.length === 1 && !expectedUrl) {
    context.addIssue({ code: "custom", message: `The URL field must match type ${input.type}` });
  }
});

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = schema.parse(await request.json());
    const mediaUrl = input.type === "IMAGE" ? input.imageUrl
      : input.type === "VIDEO" ? input.videoUrl
        : input.type === "AUDIO" ? input.audioUrl
          : input.documentUrl;
    const result = await enqueueMessage({
      actor: { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      operation: "messages.media.create",
      idempotencyKey: requireIdempotencyKey(request.headers),
      sessionPublicId: input.sessionId,
      recipient: input.recipient,
      type: input.type,
      mediaId: input.mediaId,
      mediaUrl,
      caption: input.caption,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    return apiV1Success(requestId, result.job, result.idempotent ? 200 : 202, { idempotent: result.idempotent });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
