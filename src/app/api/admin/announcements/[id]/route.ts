import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { normalizeAnnouncementBody } from "@/lib/announcement-policy";
import { announcementSchema } from "@/lib/announcement-input";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = announcementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid announcement", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await params;

  const current = await prisma.announcement.findUnique({
    where: { id },
    select: { status: true, publishedAt: true },
  });
  if (!current) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  // Editing a live announcement keeps its original publishedAt. Re-stamping it
  // here would push the popup back in front of everyone who already dismissed
  // it, which is the behaviour that turns a notice into a nag.
  const staysPublished = parsed.data.publish && current.status === "PUBLISHED";

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: normalizeAnnouncementBody(parsed.data.body),
      version: parsed.data.version || null,
      href: parsed.data.href || null,
      status: parsed.data.publish ? "PUBLISHED" : "DRAFT",
      publishedAt: staysPublished ? current.publishedAt : parsed.data.publish ? new Date() : null,
    },
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "announcement.update",
    resource: "announcement",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { status: announcement.status, republished: !staysPublished && parsed.data.publish },
  });

  return NextResponse.json({ data: announcement });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const deleted = await prisma.announcement.deleteMany({ where: { id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "announcement.delete",
    resource: "announcement",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ status: true });
}
