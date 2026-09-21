import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { parseAutoReplyBody } from "@/lib/autoreply-input";
import { apiV1Exception, getRequestId } from "@/lib/api-v1";
import { deleteAutoReplyRule, updateAutoReplyRule } from "@/lib/autoreply-service";

type Context = { params: Promise<{ sessionId: string; replyId: string }> };

export async function PUT(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const { sessionId, replyId } = await params;
    const result = await updateAutoReplyRule(user, replyId, parseAutoReplyBody(await request.json(), sessionId));
    return NextResponse.json({ status: true, data: result.rule, warnings: result.warnings });
  } catch (error) { return apiV1Exception(requestId, error); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const { sessionId, replyId } = await params;
    return NextResponse.json({ status: true, data: await deleteAutoReplyRule(user, sessionId, replyId) });
  } catch (error) { return apiV1Exception(requestId, error); }
}
