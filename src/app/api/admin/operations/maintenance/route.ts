import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { purgeExpiredAuditLogs } from "@/lib/audit-retention";
import { recordAudit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({ operation: z.literal("PURGE_EXPIRED_AUDIT_LOGS"), confirmation: z.literal("PURGE EXPIRED AUDIT LOGS") });

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Explicit maintenance confirmation is required" }, { status: 400 });
  const result = await purgeExpiredAuditLogs(getEnv().AUDIT_RETENTION_DAYS);
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "ops.audit_retention.purge",
    resource: "audit_log",
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { deleted: result.deleted, boundary: result.boundary.toISOString() },
  });
  return NextResponse.json({ data: result });
}
