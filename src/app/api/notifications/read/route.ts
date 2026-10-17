
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(req: Request) {
    const session = await auth();
    if (!session?.user?.id || session.user.accountActive === false) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        const ids = (body as { ids?: unknown }).ids;

        if (ids !== undefined && ids !== null && (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length === 0 || id.length > 64))) {
            return NextResponse.json({ status: false, message: "Invalid notification ids", error: "Invalid notification ids" }, { status: 400 });
        }

        if (Array.isArray(ids) && ids.length > 500) {
            return NextResponse.json({ status: false, message: "Too many notification ids", error: "Too many notification ids" }, { status: 400 });
        }

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            // If no IDs provided, mark ALL as read for this user
            await prisma.notification.updateMany({
                where: { userId: session.user.id, read: false },
                data: { read: true }
            });
        } else {
            await prisma.notification.updateMany({
                where: {
                    userId: session.user.id,
                    id: { in: ids }
                },
                data: { read: true }
            });
        }

        return NextResponse.json({ status: true, message: "Notifications marked as read" });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ status: false, message: "Error updating notifications", error: "Error updating notifications" }, { status: 500 });
    }
}
