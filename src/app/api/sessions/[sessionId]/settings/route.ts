import { prisma } from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession, isSessionOwner } from "@/lib/api-auth";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";

const settingsSchema = z.object({
    config: z.record(z.string(), z.unknown()).refine(
        (value) => JSON.stringify(value).length <= 32_768,
        "Configuration is too large",
    ),
});

// GET: Retrieve session settings
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { config: true }
        });

        if (!session) {
            return NextResponse.json({ status: false, message: "Session not found", error: "Session not found" }, { status: 404 });
        }

        return NextResponse.json({ status: true, message: "Session settings fetched successfully", data: session });
    } catch (e) {
        console.error("Get session settings error:", e);
        return NextResponse.json({ status: false, message: "Failed to get settings", error: "Failed to get settings" }, { status: 500 });
    }
}

// PATCH: Update session settings
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const owner = await isSessionOwner(user.id, user.role, sessionId);
        if (!owner) {
            return NextResponse.json({ status: false, message: "Only the device owner can update settings" }, { status: 403 });
        }

        const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid settings" }, { status: 400 });
        }

        const updated = await prisma.session.update({
            where: { sessionId },
            data: { config: parsed.data.config as Prisma.InputJsonValue }
        });

        // Update active instance if exists
        const instance = waManager.getInstance(sessionId);
        if (instance) {
            instance.config = parsed.data.config;
        }

        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "session.settings_update",
            resource: "session",
            resourceId: sessionId,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
        });

        return NextResponse.json({ status: true, message: "Session settings updated successfully", data: updated });

    } catch (e) {
        console.error("Update session settings error:", e);
        return NextResponse.json({ status: false, message: "Failed to update settings", error: "Failed to update settings" }, { status: 500 });
    }
}

// DELETE: Delete a session
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const owner = await isSessionOwner(user.id, user.role, sessionId);
        if (!owner) {
            return NextResponse.json({ status: false, message: "Only the device owner can delete it" }, { status: 403 });
        }

        await waManager.deleteSession(sessionId);
        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "session.delete",
            resource: "session",
            resourceId: sessionId,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
        });

        return NextResponse.json({ status: true, message: "Session deleted successfully" });

    } catch (e) {
        console.error("Delete session error:", e);
        return NextResponse.json({ status: false, message: "Failed to delete session", error: "Failed to delete session" }, { status: 500 });
    }
}
