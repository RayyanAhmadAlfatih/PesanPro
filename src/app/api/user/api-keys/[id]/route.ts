import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-key-service";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const revoked = await revokeApiKey(session.user.id, id);
  if (!revoked) return NextResponse.json({ error: "API key not found or already revoked" }, { status: 404 });

  await recordAudit({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: "api_key.revoke",
    resource: "api_key",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ message: "API key revoked" });
}
