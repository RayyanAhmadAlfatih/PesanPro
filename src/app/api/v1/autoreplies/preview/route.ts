import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { autoReplyPreviewSchema } from "@/lib/autoreply-input";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { previewAutoReply } from "@/lib/autoreply-service";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await previewAutoReply(user, autoReplyPreviewSchema.parse(await request.json())));
  } catch (error) { return apiV1Exception(requestId, error); }
}
