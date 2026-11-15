import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { parseCapacityLimits } from "@/lib/capacity";
import { prisma } from "@/lib/prisma";
import { serializeCapacityLimits } from "@/lib/superadmin-overview";

const limitString = z.string().trim().regex(/^\d+$/, "Harus berupa angka bulat").max(20).nullable();
const capacitySchema = z.object({
  cpuCores: z.number().int().min(1).max(1024).nullable().optional(),
  ramBytes: limitString.optional(),
  diskBytes: limitString.optional(),
  waSessions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  monthlyMessages: limitString.optional(),
}).strict();

const patchSchema = z.object({
  vpsMonthlyCostIdr: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Biaya VPS harus angka").optional(),
  capacityLimits: capacitySchema.optional(),
}).strict().refine((value) => value.vpsMonthlyCostIdr !== undefined || value.capacityLimits !== undefined, {
  message: "Tidak ada perubahan",
});

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const config = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    data: {
      vpsMonthlyCostIdr: config?.vpsMonthlyCostIdr?.toString() ?? "90000",
      capacityLimits: parseCapacityLimits(config?.capacityLimits),
      timezone: config?.timezone ?? "Asia/Jakarta",
    },
  });
}

export async function PATCH(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pengaturan tidak valid", details: parsed.error.flatten() }, { status: 400 });
  }

  const current = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  const currentLimits = parseCapacityLimits(current?.capacityLimits);
  const mergedLimits = parsed.data.capacityLimits
    ? { ...currentLimits, ...parsed.data.capacityLimits }
    : currentLimits;

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {
      ...(parsed.data.vpsMonthlyCostIdr !== undefined ? { vpsMonthlyCostIdr: parsed.data.vpsMonthlyCostIdr } : {}),
      ...(parsed.data.capacityLimits ? { capacityLimits: serializeCapacityLimits(mergedLimits) } : {}),
    },
    create: {
      id: "default",
      vpsMonthlyCostIdr: parsed.data.vpsMonthlyCostIdr ?? "90000",
      capacityLimits: serializeCapacityLimits(mergedLimits),
    },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "system_config.update",
    resource: "system_config",
    resourceId: config.id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: {
      fields: Object.keys(parsed.data),
      vpsMonthlyCostIdr: config.vpsMonthlyCostIdr.toString(),
    },
  });

  return NextResponse.json({
    data: {
      vpsMonthlyCostIdr: config.vpsMonthlyCostIdr.toString(),
      capacityLimits: parseCapacityLimits(config.capacityLimits),
      timezone: config.timezone,
    },
  });
}
