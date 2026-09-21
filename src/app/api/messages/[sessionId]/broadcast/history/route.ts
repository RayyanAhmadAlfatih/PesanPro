import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { listBroadcasts } from "@/lib/broadcast-service";
import { MessageJobError } from "@/lib/message-job-errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const { sessionId } = await params;
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 20)));
    const data = await listBroadcasts(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      { sessionId, limit },
    );
    return NextResponse.json({ status: true, data, total: data.length, limit, offset: 0 });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, message: "Failed to fetch history" }, { status: 500 });
  }
}
