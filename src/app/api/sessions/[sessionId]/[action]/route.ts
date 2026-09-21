import { NextResponse, NextRequest } from "next/server";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession, isSessionOwner } from "@/lib/api-auth";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { canPerformDeviceAction } from "@/lib/device-policy";
import { z } from "zod";

const actionSchema = z.enum(["start", "stop", "restart", "logout", "pair"]);
const pairingSchema = z.object({
    phoneNumber: z.string().transform((value) => value.replace(/[^0-9]/g, "")).pipe(z.string().min(8).max(15)),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, action: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const resolvedParams = await params;
        const sessionId = resolvedParams.sessionId;
        const parsedAction = actionSchema.safeParse(resolvedParams.action);
        if (!parsedAction.success) {
            return NextResponse.json({ status: false, message: "Invalid action" }, { status: 400 });
        }
        const action = parsedAction.data;

        // Verify access
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const owner = await isSessionOwner(user.id, user.role, sessionId);
        if (!canPerformDeviceAction(user.role, owner, action)) {
            return NextResponse.json({ status: false, message: "This action requires device ownership" }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));

        switch (action) {
            case "pair": {
                // Pairing brute-force guard: 5 per 15 min per user+session (Gate 0)
                const pairRl = await checkPersistentRateLimit(`pair:${user.id}:${sessionId}`, 5, 15 * 60 * 1000);
                if (!pairRl.success) {
                    return NextResponse.json(
                        { status: false, message: "Too many pairing attempts, please try again later" },
                        { status: 429, headers: rateLimitHeaders(pairRl, 5) }
                    );
                }
                const parsedPairing = pairingSchema.safeParse(body);
                if (!parsedPairing.success) {
                    return NextResponse.json({ status: false, message: "Valid phone number required for pairing" }, { status: 400 });
                }
                const { phoneNumber } = parsedPairing.data;
                const pairingCode = await waManager.requestPairingCode(sessionId, phoneNumber);
                await recordAudit({
                    userId: user.id,
                    userEmail: user.email,
                    action: "session.pair",
                    resource: "session",
                    resourceId: sessionId,
                    ip: getClientIp(request.headers),
                    userAgent: request.headers.get("user-agent"),
                    meta: { phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, "*") },
                });
                return NextResponse.json({ status: true, message: "Pairing code generated", data: { pairingCode } });
            }

            case "start":
                await waManager.startSession(sessionId);
                break;
            case "stop":
                await waManager.stopSession(sessionId);
                break;
            case "restart":
                await waManager.restartSession(sessionId);
                break;
            case "logout":
                await waManager.logoutSession(sessionId);
                break;
        }

        await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: `session.${action}`,
            resource: "session",
            resourceId: sessionId,
            ip: getClientIp(request.headers),
            userAgent: request.headers.get("user-agent"),
        });

        return NextResponse.json({ status: true, message: `Session ${action}ed successfully` });

    } catch {
        return NextResponse.json({ error: "Failed to perform device action" }, { status: 500 });
    }
}
