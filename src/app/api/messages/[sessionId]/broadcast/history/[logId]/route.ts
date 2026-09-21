import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getBroadcast } from "@/lib/broadcast-service";
import { MessageJobError } from "@/lib/message-job-errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string; logId: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const { sessionId, logId } = await params;
    const data = await getBroadcast({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, logId);
    if (data.sessionId !== sessionId) return NextResponse.json({ status: false, message: "Broadcast not found" }, { status: 404 });
    return NextResponse.json({ status: true, data });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, message: "Failed to fetch detail" }, { status: 500 });
  }
}
