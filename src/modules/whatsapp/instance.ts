import { randomUUID } from "node:crypto";
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState,
    type AnyMessageContent,
    type MiscMessageGenerationOptions,
} from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { browserIdentity } from "@/lib/wa-device-identity";
import { createPrismaAuthState } from "./auth/usePrismaAuthState";
import { Server } from "socket.io";
import pino from "pino";
import { bindSessionStore } from "./store";
import { syncGroups } from "./store/groups";
import { bindContactSync } from "./store/contacts";
import { bindPpGuard } from "./store/ppguard";
import { antispam } from "./antispam";
import { logger } from "@/lib/logger";
import { Prisma, type DeviceStatus } from "@prisma/client";

const MAX_RECONNECT_ATTEMPTS = 3;
// Baileys only reports a dead socket when its own keep-alive notices missing
// traffic. On 2026-10-21 the session stayed CONNECTED for hours while inbound
// messages stopped arriving, so the app needs its own check that does not trust
// the stored status.
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const HEALTH_PROBE_TIMEOUT_MS = 20_000;
const MAX_HEALTH_PROBE_FAILURES = 2;

export type HealthCheckResult = "ok" | "degraded" | "restarted" | "skipped";

export class WhatsAppInstance {
    socket: WASocket | null = null;
    qr: string | null = null;
    rq: string | null = null;
    status: DeviceStatus = "DISCONNECTED";
    sessionId: string;
    userId: string;
    io: Server;
    config: Record<string, unknown> = {};
    startTime: Date | null = null;
    pairingCode: string | null = null;

    isStopped: boolean = false;
    private reconnectCount: number = 0;
    private healthTimer: ReturnType<typeof setInterval> | null = null;
    private healthProbeFailures: number = 0;
    private isRestarting: boolean = false;
    private lastInboundAt: number | null = null;
    /** Called when instance auto-stops or logs out — lets manager remove it from Map */
    onRemovedFromManager: (() => void) | null = null;

    constructor(sessionId: string, userId: string, io: Server) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.io = io;
    }

    async init() {
        this.status = "CONNECTING";
        const sessionData = await prisma.session.findUnique({
            where: { sessionId: this.sessionId },
            include: { botConfig: true }
        });
        if (!sessionData) {
            logger.warn("Instance", `Session ${this.sessionId} not found in DB, aborting init`);
            return;
        }
        this.config = typeof sessionData.config === "object" && sessionData.config !== null && !Array.isArray(sessionData.config)
            ? sessionData.config
            : {};
        const botConfig = sessionData.botConfig;

        const { state, saveCreds } = await createPrismaAuthState(this.sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            version,
            logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || "error" }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: process.env.BAILEYS_LOG_LEVEL || "error" })),
            },
            browser: browserIdentity(this.sessionId),
            markOnlineOnConnect: botConfig?.alwaysOnline ?? true,
            // Full-history sync stays OFF by product policy, not by tuning:
            // the public FAQ promises we never pull old conversation history,
            // and a full-sync request streams the entire chat archive of the
            // linked number through memory on connect. On 2026-10-17 that
            // storm pushed ~1.1M messages through the store handlers in one
            // pass and OOM-looped the launch box three times.
            syncFullHistory: false,
        });
        this.socket = socket;

        // Apply Anti-Spam Wrapper to sendMessage
        const originalSendMessage = socket.sendMessage.bind(socket);
        const sessionId = this.sessionId;
        const sendMessage = async (jid: string, content: AnyMessageContent, options?: MiscMessageGenerationOptions) => {
            await antispam.enqueue(sessionId, jid, content);
            return originalSendMessage(jid, content, options);
        };
        socket.sendMessage = sendMessage;

        // Bind Store for DB Sync
        bindSessionStore(socket, this.sessionId, this.io);

        // Bind Contact Sync
        bindContactSync(socket, this.sessionId);

        socket.ev.on("creds.update", saveCreds);

        // Any frame arriving from WhatsApp proves the socket is still live. The
        // health check reports this age when it has to reconnect a silent session.
        const markInboundActivity = () => { this.lastInboundAt = Date.now(); };
        socket.ev.on("messages.upsert", markInboundActivity);
        socket.ev.on("messages.update", markInboundActivity);

        socket.ev.on("connection.update", async (update) => {
            // A socket replaced by a newer init() must not overwrite current state.
            if (socket !== this.socket) return;
            await this.handleConnectionUpdate(update);
        });
    }

    async handleConnectionUpdate(update: Partial<ConnectionState>) {
        const { connection, lastDisconnect, qr } = update;

        try {
            if (qr) {
                if (this.isStopped) return;
                // Reset reconnect count on new QR (user is re-scanning)
                this.reconnectCount = 0;
                this.qr = qr;
                this.status = "QR_REQUIRED";

                this.io?.to(this.sessionId).emit("connection.update", { status: this.status, qr });

                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { qr, status: "QR_REQUIRED" }
                });
            }

            if (connection === "close") {
                this.stopHealthMonitor();
                const disconnectError = lastDisconnect?.error as Error & { output?: { statusCode?: number } };
                const code = disconnectError?.output?.statusCode;
                const isLoggedOut = code === DisconnectReason.loggedOut;

                if (isLoggedOut) {
                    // Logged out: stop permanently, remove from memory
                    this.status = "LOGGED_OUT";
                    this.socket = null;
                    this.config = {};
                    this.io?.to(this.sessionId).emit("connection.update", { status: "LOGGED_OUT", qr: null });

                    logger.info("Instance", `Session ${this.sessionId} logged out. Deleting credentials...`);
                    try {
                        await prisma.$transaction([
                            prisma.session.update({
                                where: { sessionId: this.sessionId },
                                data: { status: "LOGGED_OUT", qr: null }
                            }),
                            prisma.authState.deleteMany({
                                where: { sessionId: this.sessionId }
                            })
                        ]);
                    } catch { /* ignore */ }
                    logger.success("Instance", `Session ${this.sessionId} credentials deleted.`);

                    // Remove from memory manager
                    this.onRemovedFromManager?.();
                    return;
                }

                if (this.isStopped) {
                    // Explicitly stopped: preserve creds for restart
                    this.status = "STOPPED";
                    this.socket = null;
                    this.reconnectCount = 0;
                    this.io?.to(this.sessionId).emit("connection.update", { status: "STOPPED", qr: null });

                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "STOPPED", qr: null }
                    }).catch(() => {});
                    logger.warn("Instance", `Session ${this.sessionId} stopped. Credentials preserved.`);

                    // Remove from memory manager
                    this.onRemovedFromManager?.();
                    return;
                }

                // Unexpected disconnect: retry with limit
                this.reconnectCount++;
                const remaining = MAX_RECONNECT_ATTEMPTS - this.reconnectCount + 1;

                if (remaining > 0) {
                    this.status = "RECONNECTING";
                    this.io?.to(this.sessionId).emit("connection.update", { status: "RECONNECTING", qr: null });
                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "RECONNECTING", qr: null }
                    }).catch(() => {});

                    logger.warn("Instance",
                        `Session ${this.sessionId} disconnected. Reconnecting (${this.reconnectCount}/${MAX_RECONNECT_ATTEMPTS})...`
                    );
                    setTimeout(() => {
                        if (!this.isStopped) this.init();
                    }, 3000);
                } else {
                    // Max retries exceeded — auto-stop
                    this.status = "STOPPED";
                    this.socket = null;
                    this.reconnectCount = 0;
                    this.isStopped = true; // prevent further retries
                    this.io?.to(this.sessionId).emit("connection.update", { status: "STOPPED", qr: null });

                    await prisma.session.update({
                        where: { sessionId: this.sessionId },
                        data: { status: "STOPPED", qr: null }
                    }).catch(() => {});
                    logger.error("Instance",
                        `Session ${this.sessionId} max reconnects (${MAX_RECONNECT_ATTEMPTS}) reached. Auto-stopped.`
                    );

                    // Remove from memory manager
                    this.onRemovedFromManager?.();
                }
            }

            if (connection === "open") {
                // Connected — reset reconnect count
                this.reconnectCount = 0;
                this.isStopped = false;
                this.status = "CONNECTED";
                this.qr = null;
                this.startTime = new Date();

                this.io?.to(this.sessionId).emit("connection.update", { status: "CONNECTED", qr: null });

                try {
                    await syncGroups(this.socket as WASocket, this.sessionId);
                } catch (e) {
                    logger.error("Instance", "Group sync failed:", e);
                }

                bindPpGuard(this.socket as WASocket, this.sessionId);

                await prisma.session.update({
                    where: { sessionId: this.sessionId },
                    data: { status: "CONNECTED", qr: null }
                });

                logger.success("Instance", `Session ${this.sessionId} connected and synced successfully`);

                this.startHealthMonitor();
            }
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
                logger.warn("Instance", `Session ${this.sessionId} record not found during update. Stopping.`);
                this.socket?.end(undefined);
                this.socket = null;
            } else {
                logger.error("Instance", "Error in handleConnectionUpdate:", error);
            }
        }
    }

    private startHealthMonitor() {
        this.stopHealthMonitor();
        this.healthProbeFailures = 0;
        const timer = setInterval(() => {
            void this.checkHealth();
        }, HEALTH_CHECK_INTERVAL_MS);
        timer.unref?.();
        this.healthTimer = timer;
    }

    private stopHealthMonitor() {
        if (this.healthTimer) clearInterval(this.healthTimer);
        this.healthTimer = null;
    }

    /**
     * Verify that the WhatsApp socket is still usable, not just that the DB row
     * says CONNECTED. A closed transport is restarted immediately; a socket that
     * stops answering protocol pings is restarted after two consecutive misses.
     */
    async checkHealth(): Promise<HealthCheckResult> {
        if (this.isStopped || this.isRestarting || this.status !== "CONNECTED") return "skipped";

        const socket = this.socket;
        if (!socket || !socket.ws?.isOpen) {
            await this.recoverSilentConnection("socket is not open");
            return "restarted";
        }

        try {
            await socket.query({
                tag: "iq",
                attrs: {
                    id: `health-${randomUUID()}`,
                    to: "@s.whatsapp.net",
                    type: "get",
                    xmlns: "w:p",
                },
                content: [{ tag: "ping", attrs: {} }],
            }, HEALTH_PROBE_TIMEOUT_MS);
            this.healthProbeFailures = 0;
            return "ok";
        } catch (error) {
            this.healthProbeFailures += 1;
            logger.warn("Instance",
                `Session ${this.sessionId} health probe failed (${this.healthProbeFailures}/${MAX_HEALTH_PROBE_FAILURES})`,
                error
            );
            if (this.healthProbeFailures >= MAX_HEALTH_PROBE_FAILURES) {
                await this.recoverSilentConnection("health probe did not answer");
                return "restarted";
            }
            return "degraded";
        }
    }

    private async recoverSilentConnection(reason: string) {
        if (this.isRestarting) return;
        this.isRestarting = true;
        this.stopHealthMonitor();

        const idleMinutes = this.lastInboundAt === null
            ? null
            : Math.round((Date.now() - this.lastInboundAt) / 60_000);
        logger.error("Instance",
            `Session ${this.sessionId} connection unhealthy (${reason}${idleMinutes === null ? "" : `, last inbound ${idleMinutes} min ago`}). Reconnecting.`
        );

        const staleSocket = this.socket;
        this.socket = null;
        this.healthProbeFailures = 0;
        this.status = "RECONNECTING";
        this.io?.to(this.sessionId).emit("connection.update", { status: "RECONNECTING", qr: null });
        await prisma.session.update({
            where: { sessionId: this.sessionId },
            data: { status: "RECONNECTING", qr: null },
        }).catch(() => {});

        try {
            staleSocket?.end(undefined);
        } catch {
            // The transport may already be closed; reconnecting is still correct.
        }

        try {
            await this.init();
        } catch (error) {
            logger.error("Instance", `Session ${this.sessionId} reconnect after health check failed`, error);
            this.status = "FAILED";
            await prisma.session.update({
                where: { sessionId: this.sessionId },
                data: { status: "FAILED", qr: null },
            }).catch(() => {});
        } finally {
            this.isRestarting = false;
        }
    }

    async requestPairingCode(phoneNumber: string) {
        if (!this.socket) {
            throw new Error("Socket not initialized");
        }

        try {
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            if (!cleanNumber) throw new Error("Invalid phone number");

            const code = await this.socket.requestPairingCode(cleanNumber);
            this.pairingCode = code;
            this.status = "PAIRING_REQUIRED";

            await prisma.session.update({
                where: { sessionId: this.sessionId },
                data: { status: "PAIRING_REQUIRED", qr: null },
            });

            this.io?.to(this.sessionId).emit("connection.update", {
                status: this.status,
                qr: this.qr,
                pairingCode: code
            });

            return code;
        } catch (error) {
            logger.error("Instance", "Pairing code error:", error);
            throw error;
        }
    }

    /** Clean shutdown without triggering reconnect */
    async shutdown() {
        this.isStopped = true;
        this.stopHealthMonitor();
        this.socket?.end(undefined);
        this.socket = null;
        this.reconnectCount = 0;
    }
}
