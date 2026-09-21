import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid alert filters" }, { status: 400 });
  const data = await prisma.operationalAlert.findMany({
    where: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.severity ? { severity: parsed.data.severity } : {}) },
    orderBy: [{ status: "asc" }, { severity: "desc" }, { lastSeenAt: "desc" }],
    take: parsed.data.limit,
  });
  return NextResponse.json({ data });
}
