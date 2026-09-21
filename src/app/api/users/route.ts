import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    const user = await getAuthenticatedUser(request);

    // Only SUPERADMIN can list users
    if (!user || !isAdmin(user.role)) {
        return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 403 });
    }

    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                deviceLimit: true,
                createdAt: true,
                _count: {
                    select: { sessions: true }
                },
                subscription: {
                    include: { plan: { select: { id: true, code: true, name: true } } }
                },
            }
        });

        return NextResponse.json({ status: true, message: "Users fetched successfully", data: users });
    } catch {
        return NextResponse.json({ status: false, message: "Failed to fetch users", error: "Failed to fetch users" }, { status: 500 });
    }
}
