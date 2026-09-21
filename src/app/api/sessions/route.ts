import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, getAccessibleSessions } from "@/lib/api-auth";
import { z } from "zod";
import { DeviceLimitError, DevicePermissionError } from "@/lib/device-policy";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = 'force-dynamic';

const createSessionSchema = z.object({
    name: z.string().trim().min(2).max(100),
    sessionId: z.string().trim().regex(/^[a-zA-Z0-9_-]{6,64}$/).optional(),
});

// GET: Fetch sessions (filtered by user role)
export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        // Get sessions based on user role
        const sessions = await getAccessibleSessions(user.id, user.role);
        return NextResponse.json({ status: true, message: "Sessions retrieved successfully", data: sessions });
    } catch (error) {
        console.error("Get sessions error:", error);
        return NextResponse.json({ status: false, message: "Failed to fetch sessions", error: "Failed to fetch sessions" }, { status: 500 });
    }
}

// POST: Create new session (always for the authenticated user)
export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const parsed = createSessionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ status: false, message: "Invalid session data", error: parsed.error.flatten() }, { status: 400 });
        }

        const session = await waManager.createSession(user.id, user.role, parsed.data.name, parsed.data.sessionId);
        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "session.create",
            resource: "session",
            resourceId: session.sessionId,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
        });
        return NextResponse.json({ status: true, message: "Session created successfully", data: session });
    } catch (error) {
        if (error instanceof DeviceLimitError) {
            return NextResponse.json({ status: false, message: "Device limit reached", limit: error.limit }, { status: 409 });
        }
        if (error instanceof DevicePermissionError) {
            return NextResponse.json({ status: false, message: error.message }, { status: 403 });
        }
        return NextResponse.json({ status: false, message: "Failed to create session", error: "Failed to create session" }, { status: 500 });
    }
}
