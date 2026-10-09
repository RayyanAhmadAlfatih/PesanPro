import { NextResponse } from "next/server";

/**
 * GET /api/messages/{sessionId}/download/{messageId}/media
 *
 * Retired (410 Gone) — intentional, not an error.
 *
 * PesanPro is a WhatsApp gateway, not a media store. Message media is no
 * longer downloaded from WhatsApp or persisted to disk, so there is nothing
 * for this endpoint to serve. The webhook payloads for `message.received` and
 * `message.sent` no longer carry a `fileUrl` field either.
 *
 * Media that the tenant uploads to send (payment proof, broadcast/campaign
 * attachments) is unaffected and still served through the private-media APIs.
 */
export async function GET() {
    return NextResponse.json(
        {
            status: false,
            code: "MEDIA_DOWNLOAD_RETIRED",
            message:
                "Message media download has been retired. PesanPro no longer stores WhatsApp message media; webhook payloads no longer include fileUrl.",
            error: "Gone",
        },
        { status: 410 }
    );
}
