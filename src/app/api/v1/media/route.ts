import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { listPrivateMedia, storePrivateMedia } from "@/lib/private-media";
import { parsePrivateMediaUpload } from "@/lib/private-media-upload";

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
    const upload = await parsePrivateMediaUpload(request);
    const data = await storePrivateMedia({
      actor: { id: user.id, role: user.role, ownerId: user.ownerId },
      ...upload,
    });
    return apiV1Success(requestId, data, 201);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
