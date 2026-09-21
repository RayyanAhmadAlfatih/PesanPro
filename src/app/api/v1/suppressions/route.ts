import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { suppressionWriteSchema } from "@/lib/broadcast-input";
import { addSuppression, listSuppressions } from "@/lib/suppression";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await listSuppressions(
      { id: user.id, role: user.role, ownerId: user.ownerId },
      Number(request.nextUrl.searchParams.get("limit") || 100),
    ));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = suppressionWriteSchema.parse(await request.json());
    return apiV1Success(requestId, await addSuppression({ id: user.id, role: user.role, ownerId: user.ownerId }, input.recipient, input.reason), 201);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
