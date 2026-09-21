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

        const updateData: Prisma.UserUpdateInput = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (password) {
            updateData.password = await bcrypt.hash(password, 12);
        }
        if (password || role || status) {
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

    try {
        const sessions = await prisma.session.findMany({ where: { userId: id }, select: { sessionId: true } });
        await Promise.all(sessions.map((session) => waManager.stopSession(session.sessionId)));
        await prisma.$transaction([
            prisma.authState.deleteMany({ where: { sessionId: { in: sessions.map((session) => session.sessionId) } } }),
            prisma.user.delete({ where: { id } }),
        ]);
        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "admin.user_delete",
            resource: "user",
            resourceId: id,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
        });
        return NextResponse.json({ status: true, message: "User deleted successfully" });
    } catch (error) {
        console.error("Delete user error:", error);
        return NextResponse.json({ status: false, message: "Failed to delete user", error: "Failed to delete user" }, { status: 500 });
    }
}
