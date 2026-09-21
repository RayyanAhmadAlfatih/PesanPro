import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import type { WAPresence } from "@whiskeysockets/baileys";

const presenceValues = ["composing", "recording", "paused", "available", "unavailable"] as const satisfies readonly WAPresence[];

function isPresence(value: unknown): value is WAPresence {
    return typeof value === "string" && presenceValues.some((presence) => presence === value);
}

// POST: Send presence (typing, recording, online)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid } = await params;
        const body: unknown = await request.json();
        const presence = typeof body === "object" && body !== null && "presence" in body ? body.presence : undefined;

        if (!isPresence(presence)) {
            return NextResponse.json({ 
                error: `Invalid presence. Must be one of: ${presenceValues.join(', ')}`
            }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        const decodedJid = decodeURIComponent(jid);

        // Send presence update
        await instance.socket.sendPresenceUpdate(presence, decodedJid);

        return NextResponse.json({ status: true, message: `Presence '${presence}' sent to ${decodedJid}` });

    } catch (error) {
        console.error("Send presence error:", error);
        return NextResponse.json({ status: false, message: "Failed to send presence", error: "Failed to send presence" }, { status: 500 });
    }
}
