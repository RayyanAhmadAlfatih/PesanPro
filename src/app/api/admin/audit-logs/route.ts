import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  action: z.string().trim().max(191).optional(),
  resource: z.string().trim().max(191).optional(),
  userEmail: z.string().trim().max(320).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid audit filters" }, { status: 400 });
  const data = await prisma.auditLog.findMany({
    where: {
      ...(parsed.data.action ? { action: { contains: parsed.data.action } } : {}),
      ...(parsed.data.resource ? { resource: parsed.data.resource } : {}),
      ...(parsed.data.userEmail ? { userEmail: { contains: parsed.data.userEmail } } : {}),
      ...(parsed.data.before ? { createdAt: { lt: new Date(parsed.data.before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit,
  });
  return NextResponse.json({ data, nextBefore: data.at(-1)?.createdAt ?? null });
}
