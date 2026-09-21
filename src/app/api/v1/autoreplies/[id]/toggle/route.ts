import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { setAutoReplyRuleEnabled } from "@/lib/autoreply-service";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ sessionId: z.string().trim().min(1).max(191), isEnabled: z.boolean() }).strict();

export async function POST(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = schema.parse(await request.json());
    return apiV1Success(requestId, await setAutoReplyRuleEnabled(user, input.sessionId, (await params).id, input.isEnabled));
  } catch (error) { return apiV1Exception(requestId, error); }
}
