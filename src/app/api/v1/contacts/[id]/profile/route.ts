import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { contactProfileWriteSchema } from "@/lib/segment-input";
import { updateContactProfile } from "@/lib/segment-service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await updateContactProfile(user, (await params).id, contactProfileWriteSchema.parse(await request.json())));
  } catch (error) { return apiV1Exception(requestId, error); }
}
