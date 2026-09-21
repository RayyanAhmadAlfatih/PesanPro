import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { segmentWriteSchema } from "@/lib/segment-input";
import { createSegment, listSegments } from "@/lib/segment-service";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await listSegments(user));
  } catch (error) { return apiV1Exception(requestId, error); }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = segmentWriteSchema.parse(await request.json());
    return apiV1Success(requestId, await createSegment(user, input), 201);
  } catch (error) { return apiV1Exception(requestId, error); }
}
