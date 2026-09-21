import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { deletePrivateMedia, loadPrivateMedia } from "@/lib/private-media";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await params;
    const { media, buffer } = await loadPrivateMedia({ id: user.id, role: user.role, ownerId: user.ownerId }, id);
    const fileName = media.originalName.replace(/["\r\n]/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": media.mimeType,
        "content-length": String(buffer.length),
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await params;
    return apiV1Success(requestId, await deletePrivateMedia({ id: user.id, role: user.role, ownerId: user.ownerId }, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
