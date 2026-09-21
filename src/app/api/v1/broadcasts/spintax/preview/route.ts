import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { spintaxPreviewSchema } from "@/lib/broadcast-input";
import { previewBroadcastTemplate } from "@/lib/broadcast-template";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = spintaxPreviewSchema.parse(await request.json());
    return apiV1Success(requestId, previewBroadcastTemplate(input.message, input.variables ?? {}, input.count));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
