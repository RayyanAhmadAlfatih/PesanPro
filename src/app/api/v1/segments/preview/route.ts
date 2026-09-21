import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { segmentPreviewSchema } from "@/lib/segment-input";
import { evaluateSegmentDefinition } from "@/lib/segment-service";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = segmentPreviewSchema.parse(await request.json());
    const result = await evaluateSegmentDefinition(user, input.sessionId, input.definition, input.sampleLimit);
    return apiV1Success(requestId, { count: result.count, complexity: result.complexity, sample: result.sample });
  } catch (error) { return apiV1Exception(requestId, error); }
}
