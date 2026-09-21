import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// GET: Download media from message
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; messageId: string }> }
) {
    const { sessionId, messageId } = await params;
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        // Find message in database
        const message = await prisma.message.findUnique({
            where: { id: messageId },
        });

        if (!message) {
            return NextResponse.json({ status: false, message: "Message not found", error: "Message not found" }, { status: 404 });
        }

        if (message.sessionId !== sessionId) {
            return NextResponse.json({ status: false, message: "Message does not belong to this session", error: "Message does not belong to this session" }, { status: 403 });
        }

        if (!message.mediaUrl) {
            return NextResponse.json({ status: false, message: "Message has no media", error: "Message has no media" }, { status: 404 });
        }

        if (message.mediaUrl.startsWith("http://") || message.mediaUrl.startsWith("https://")) {
            return NextResponse.redirect(new URL(message.mediaUrl));
        }

        if (!message.mediaUrl.startsWith("/api/media/")) {
            return NextResponse.json({ status: false, message: "Invalid media location", error: "Invalid media location" }, { status: 400 });
        }

        // The private media route performs filename and tenant validation again.
        return NextResponse.redirect(new URL(message.mediaUrl, request.url));

    } catch (error) {
        console.error("Download media error:", error);
        return NextResponse.json({ status: false, message: "Failed to download media", error: "Failed to download media" }, { status: 500 });
    }
}
