import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { syncChangelogAnnouncements } from "@/lib/announcement-service";

/**
 * Imports release notes from src/lib/changelog.ts as drafts. Nothing here
 * publishes, so a release still waits for an operator to decide it is worth
 * interrupting people with.
 */
export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await syncChangelogAnnouncements(actor.id);

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "announcement.sync",
    resource: "announcement",
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: result,
  });

  return NextResponse.json({ data: result });
}
