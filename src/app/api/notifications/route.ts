
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSocketServer } from "@/lib/socket-server";

const notificationSchema = z.object({
    title: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(10_000),
    type: z.enum(["INFO", "WARNING", "SUCCESS", "SYSTEM"]).default("INFO"),
    href: z.string().trim().max(2_048).optional(),
    targetUserId: z.string().trim().min(1).optional(),
    broadcast: z.boolean().default(false),
}).refine((data) => data.broadcast !== Boolean(data.targetUserId), {
    message: "Provide exactly one of targetUserId or broadcast=true",
});

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id || session.user.accountActive === false) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: 50 // Limit to last 50
        });
        return NextResponse.json({ status: true, message: "Notifications fetched successfully", data: notifications });
    } catch {
        return NextResponse.json({ status: false, message: "Error fetching notifications", error: "Error fetching notifications" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id || session.user.accountActive === false) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    // Only SUPERADMIN can send global notifications
    // But system might trigger it too. For now check role.
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (user?.role !== "SUPERADMIN") {
        return NextResponse.json({ status: false, message: "Forbidden: Only Superadmin can send notifications", error: "Forbidden" }, { status: 403 });
    }

    try {
        const parsed = notificationSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid notification payload", error: parsed.error.flatten() }, { status: 400 });
        }
        const { title, message, type, href, targetUserId, broadcast } = parsed.data;

        if (broadcast) {
            // Send to ALL users
            const allUsers = await prisma.user.findMany({ select: { id: true } });
            const notifications = allUsers.map((u: { id: string }) => ({
                userId: u.id,
                title,
                message,
                type,
                href,
                read: false
            }));

            await prisma.notification.createMany({ data: notifications });

            // Emit Socket.IO event for each user
            const io = getSocketServer();
            if (io) {
                allUsers.forEach((u: { id: string }) => {
                    io.to(`user:${u.id}`).emit('notification:new', {
                        userId: u.id,
                        title,
                        message,
                        type,
                        href,
                        createdAt: new Date().toISOString(),
                        read: false
                    });
                });
            }

            return NextResponse.json({ status: true, message: "Notifications broadcasted successfully", data: { count: allUsers.length } });
        } else if (targetUserId) {
            const targetExists = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
            if (!targetExists) {
                return NextResponse.json({ status: false, message: "Target user not found", error: "Target user not found" }, { status: 404 });
            }
            // Send to specific user
            const notification = await prisma.notification.create({
                data: {
                    userId: targetUserId,
                    title,
                    message,
                    type,
                    href,
                }
            });

            // Emit Socket.IO event
            const io = getSocketServer();
            if (io) {
                io.to(`user:${targetUserId}`).emit('notification:new', {
                    id: notification.id,
                    userId: targetUserId,
                    title,
                    message,
                    type,
                    href,
                    createdAt: notification.createdAt
                });
            }

            return NextResponse.json({ status: true, message: "Notification sent successfully" });
        }

        return NextResponse.json({ status: false, message: "Invalid Request", error: "Provide targetUserId or broadcast=true" }, { status: 400 });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ status: false, message: "Error creating notification", error: "Error creating notification" }, { status: 500 });
    }
}
