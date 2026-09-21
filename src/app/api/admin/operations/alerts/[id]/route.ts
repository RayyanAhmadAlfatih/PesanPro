import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { updateOperationalAlert } from "@/lib/operations";
import { getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({ action: z.enum(["ACKNOWLEDGE", "RESOLVE"]), reason: z.string().trim().min(3).max(500) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid alert action" }, { status: 400 });
  const { id } = await params;
  if (!await updateOperationalAlert({ id, action: parsed.data.action, actorEmail: actor.email ?? "unknown" })) {
    return NextResponse.json({ error: "Active alert not found" }, { status: 404 });
  }
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: `ops.alert.${parsed.data.action.toLowerCase()}`,
    resource: "operational_alert",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { reason: parsed.data.reason },
  });
  return NextResponse.json({ data: { id, status: parsed.data.action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "RESOLVED" } });
}
