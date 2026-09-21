import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { parseAutoReplyBody } from "@/lib/autoreply-input";
import { apiV1Exception, getRequestId } from "@/lib/api-v1";
import { createAutoReplyRule, listAutoReplyRules } from "@/lib/autoreply-service";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const data = await listAutoReplyRules(user, (await params).sessionId);
    return NextResponse.json({ status: true, message: "Auto-replies retrieved successfully", data });
  } catch (error) { return apiV1Exception(requestId, error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const input = parseAutoReplyBody(await request.json(), (await params).sessionId);
    const result = await createAutoReplyRule(user, input);
    return NextResponse.json({ status: true, message: "Auto-reply created successfully", data: result.rule, warnings: result.warnings }, { status: 201 });
  } catch (error) { return apiV1Exception(requestId, error); }
}
