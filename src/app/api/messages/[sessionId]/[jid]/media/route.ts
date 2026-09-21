import crypto from "node:crypto";
import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { commercialErrorResponse } from "@/lib/commercial-errors";
import { enqueueMessage } from "@/lib/message-job-service";
import { storePrivateMedia } from "@/lib/private-media";

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
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const type = formData.get("type") as string; // image, video, audio, document
        const caption = formData.get("caption") as string || "";
        
        if (!file) {
             return NextResponse.json({ status: false, message: "file is required", error: "file is required" }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const decodedJid = decodeURIComponent(jid);

        // WhatsApp Channel (Newsletter) strictly enforces JPEG format for images
        // Sending PNGs or other formats will cause the Mobile client to crash/fail to load.
        if (decodedJid.includes('@newsletter') && type === 'image' && file.type !== 'image/jpeg') {
            return NextResponse.json(
                { 
                    status: false, 
                    message: "WhatsApp Channels/Newsletters sementara waktu HANYA mendukung format gambar JPG/JPEG. Silakan gunakan format tersebut.", 
                    error: "Unsupported media format for Newsletter" 
                }, 
                { status: 400 }
            );
        }
        const buffer = Buffer.from(await file.arrayBuffer());

        const typeMap = { image: "IMAGE", video: "VIDEO", audio: "AUDIO", document: "DOCUMENT" } as const;
        const messageType = typeMap[type as keyof typeof typeMap];
        if (!messageType) {
            return NextResponse.json({ status: false, message: "Unsupported media type", error: "Unsupported media type" }, { status: 415 });
        }
        const media = await storePrivateMedia({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId },
            sessionPublicId: sessionId,
            originalName: file.name,
            declaredMimeType: file.type,
            buffer,
        });
        const sent = await enqueueMessage({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
            operation: "legacy.message.media",
            idempotencyKey: request.headers.get("idempotency-key") || `legacy-media-${crypto.randomUUID()}`,
            sessionPublicId: sessionId,
            recipient: decodedJid,
            type: messageType,
            mediaId: media.id,
            caption,
        });

        return NextResponse.json({ status: true, message: "Media queued successfully", data: sent.job }, { status: 202 });

    } catch (e) {
        const commercialError = commercialErrorResponse(e);
        if (commercialError) return commercialError;
        console.error("Media send error", e);
        return NextResponse.json({ status: false, message: "Failed to send media", error: "Failed to send media" }, { status: 500 });
    }
}
