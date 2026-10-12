import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { normalizeAnnouncementBody } from "@/lib/announcement-policy";
import { announcementSchema } from "@/lib/announcement-input";
import { countPendingChangelogEntries, listAnnouncements } from "@/lib/announcement-service";

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [announcements, pendingChangelog] = await Promise.all([
    listAnnouncements(),
    countPendingChangelogEntries(),
  ]);
  return NextResponse.json({ data: announcements, meta: { pendingChangelog } });
}

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = announcementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid announcement", details: parsed.error.flatten() }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: normalizeAnnouncementBody(parsed.data.body),
      version: parsed.data.version || null,
      href: parsed.data.href || null,
      status: parsed.data.publish ? "PUBLISHED" : "DRAFT",
      publishedAt: parsed.data.publish ? new Date() : null,
      source: "MANUAL",
      createdById: actor.id,
    },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "announcement.create",
    resource: "announcement",
    resourceId: announcement.id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { status: announcement.status, source: announcement.source },
  });

  return NextResponse.json({ data: announcement }, { status: 201 });
}
