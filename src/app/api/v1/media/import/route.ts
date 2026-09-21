import path from "node:path";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { getEnv } from "@/lib/env";
import { storePrivateMedia } from "@/lib/private-media";
import { safeFetch } from "@/lib/ssrf";

const schema = z.object({
  url: z.string().url().max(2048),
  sessionId: z.string().min(1).max(191).optional(),
  fileName: z.string().min(1).max(191).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = schema.parse(await request.json());
    const maxBytes = getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    const response = await safeFetch(input.url, {}, { timeoutMs: 15_000, maxBytes, maxRedirects: 2 });
    if (!response.ok) return apiV1Error(requestId, "MEDIA_FETCH_FAILED", "Remote media could not be downloaded", 422);
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) return apiV1Error(requestId, "MEDIA_TOO_LARGE", "Remote media exceeds the upload limit", 413);
    const data = await storePrivateMedia({
      actor: { id: user.id, role: user.role, ownerId: user.ownerId },
      sessionPublicId: input.sessionId,
      originalName: input.fileName || path.basename(new URL(input.url).pathname) || "remote-media",
      declaredMimeType: response.headers.get("content-type") || "application/octet-stream",
      buffer: Buffer.from(arrayBuffer),
    });
    return apiV1Success(requestId, data, 201);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
