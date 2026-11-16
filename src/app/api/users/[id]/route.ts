import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { passwordSchema } from "@/lib/password-policy";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { waManager } from "@/modules/whatsapp/manager";

const updateUserSchema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    password: passwordSchema.optional(),
    role: z.enum(["SUPERADMIN", "USER"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);

    // Only SUPERADMIN can update users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    try {
        const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid user data" }, { status: 400 });
        }
        const { name, email, password, role, status } = parsed.data;

        // Prevent modifying own role to lock oneself out (optional safety)
        if (id === user.id && ((role && role !== "SUPERADMIN") || status === "SUSPENDED")) {
            return NextResponse.json({ status: false, message: "Cannot remove your own superadmin access" }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({ where: { id }, select: { id: true } });
        if (!existingUser) {
            return NextResponse.json({ status: false, message: "User not found" }, { status: 404 });
        }

        const updateData: Prisma.UserUpdateInput = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (password) {
            updateData.password = await bcrypt.hash(password, 12);
        }
        // Any change to credentials or login identity must invalidate existing
        // sessions. An email change previously left the target's JWTs valid.
        if (password || role || status || email) {
            updateData.sessionVersion = { increment: 1 };
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                deviceLimit: true,
                updatedAt: true
            }
        });

        if (status === "SUSPENDED") {
            const sessions = await prisma.session.findMany({ where: { userId: id }, select: { sessionId: true } });
            await Promise.all(sessions.map((session) => waManager.stopSession(session.sessionId)));
        }

        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "admin.user_update",
            resource: "user",
            resourceId: id,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
            meta: { fields: Object.keys(parsed.data) },
        });

        return NextResponse.json({ status: true, message: "User updated successfully", data: updatedUser });

    } catch (error) {
        console.error("Update user error:", error);
        return NextResponse.json({ status: false, message: "Failed to update user", error: "Failed to update user" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getAuthenticatedUser(request);

    // Only SUPERADMIN can delete users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    if (id === user.id) {
        return NextResponse.json({ status: false, message: "Cannot delete yourself", error: "Cannot delete yourself" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existingUser) {
        return NextResponse.json({ status: false, message: "User not found", error: "User not found" }, { status: 404 });
    }

    // Refuse deletion if user is a requester/uploader/creator for another tenant or global records
    const [foreignJob, foreignMedia, foreignOverride, promoCreated, planPriceChanged] = await Promise.all([
        prisma.messageJob.findFirst({
            where: { requestedById: id, tenantId: { not: id } },
            select: { id: true },
        }),
        prisma.privateMedia.findFirst({
            where: { uploaderId: id, tenantId: { not: id } },
            select: { id: true },
        }),
        prisma.tenantEntitlementOverride.findFirst({
            where: { createdById: id, tenantId: { not: id } },
            select: { id: true },
        }),
        prisma.promo.findFirst({
            where: { createdById: id },
            select: { id: true },
        }),
        prisma.planPriceHistory.findFirst({
            where: { changedById: id },
            select: { id: true },
        }),
    ]);

    if (foreignJob) {
        return NextResponse.json(
            {
                status: false,
                message: "Cannot delete user: user is the requester of message jobs belonging to another tenant",
                error: "Cannot delete user: user is the requester of message jobs belonging to another tenant",
            },
            { status: 409 }
        );
    }

    if (foreignMedia) {
        return NextResponse.json(
            {
                status: false,
                message: "Cannot delete user: user uploaded media belonging to another tenant",
                error: "Cannot delete user: user uploaded media belonging to another tenant",
            },
            { status: 409 }
        );
    }

    if (foreignOverride) {
        return NextResponse.json(
            {
                status: false,
                message: "Cannot delete user: user created entitlement overrides for another tenant",
                error: "Cannot delete user: user created entitlement overrides for another tenant",
            },
            { status: 409 }
        );
    }

    if (promoCreated) {
        return NextResponse.json(
            {
                status: false,
                message: "Cannot delete user: user created promotional codes",
                error: "Cannot delete user: user created promotional codes",
            },
            { status: 409 }
        );
    }

    if (planPriceChanged) {
        return NextResponse.json(
            {
                status: false,
                message: "Cannot delete user: user has recorded plan price history",
                error: "Cannot delete user: user has recorded plan price history",
            },
            { status: 409 }
        );
    }

    try {
        const sessions = await prisma.session.findMany({ where: { userId: id }, select: { id: true, sessionId: true } });
        await Promise.all(sessions.map((session) => waManager.stopSession(session.sessionId)));
        const sessionDbIds = sessions.map((s) => s.id);
        const sessionPublicIds = sessions.map((s) => s.sessionId);

        await prisma.$transaction(async (tx) => {
            // Delete dependent records that have Restrict relations to PrivateMedia or Session
            await tx.campaign.deleteMany({ where: { tenantId: id } });
            await tx.broadcastLog.deleteMany({
                where: {
                    OR: [
                        { tenantId: id },
                        ...(sessionDbIds.length > 0 ? [{ sessionDbId: { in: sessionDbIds } }] : []),
                    ],
                },
            });

            if (sessionDbIds.length > 0) {
                await tx.scheduledMessage.deleteMany({ where: { sessionId: { in: sessionDbIds } } });
                await tx.autoReply.deleteMany({ where: { sessionId: { in: sessionDbIds } } });
            }

            // Clean Restrict relations on User before deleting user
            await tx.messageJob.deleteMany({ where: { OR: [{ tenantId: id }, { requestedById: id }] } });
            await tx.privateMedia.deleteMany({ where: { OR: [{ tenantId: id }, { uploaderId: id }] } });
            await tx.tenantEntitlementOverride.deleteMany({ where: { OR: [{ tenantId: id }, { createdById: id }] } });

            if (sessionPublicIds.length > 0) {
                await tx.authState.deleteMany({ where: { sessionId: { in: sessionPublicIds } } });
            }

            await tx.user.delete({ where: { id } });
        });
    } catch (error) {
        console.error("Delete user error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to delete user";
        return NextResponse.json({ status: false, message: errorMessage, error: errorMessage }, { status: 500 });
    }

    // Record audit log outside the deletion failure path so audit failure doesn't mask successful deletion
    try {
        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "admin.user_delete",
            resource: "user",
            resourceId: id,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
        });
    } catch (auditError) {
        console.error("Record audit error on user delete:", auditError);
    }

    return NextResponse.json({ status: true, message: "User deleted successfully" });
}
