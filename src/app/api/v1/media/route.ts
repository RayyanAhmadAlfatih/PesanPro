import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { listPrivateMedia, storePrivateMedia } from "@/lib/private-media";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const data = await listPrivateMedia({ id: user.id, role: user.role, ownerId: user.ownerId }, Number(request.nextUrl.searchParams.get("limit") || 50));
    return apiV1Success(requestId, data);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiV1Error(requestId, "VALIDATION_ERROR", "A media file is required", 422);
    const data = await storePrivateMedia({
      actor: { id: user.id, role: user.role, ownerId: user.ownerId },
      sessionPublicId: typeof form.get("sessionId") === "string" ? String(form.get("sessionId")) : undefined,
      originalName: file.name,
      declaredMimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    return apiV1Success(requestId, data, 201);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
