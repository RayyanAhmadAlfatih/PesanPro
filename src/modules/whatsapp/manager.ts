import { prisma } from "@/lib/prisma";
import { WhatsAppInstance } from "./instance";
import { Server } from "socket.io";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import type { Role } from "@prisma/client";
import { createOwnedSession } from "@/lib/session-service";
import { shouldRecoverDevice } from "@/lib/device-policy";
import {
    acquireSessionRuntimeLock,
    createWorkerId,
    heartbeatSessionRuntimeLock,
    releaseSessionRuntimeLock,
} from "@/lib/session-runtime-lock";

function generateSessionIdentifier(): string {
    return crypto.randomBytes(8).toString("hex");
}

export class WhatsAppManager {
    private static instance: WhatsAppManager;
    private sessions: Map<string, WhatsAppInstance> = new Map();
    private sessionDbIds: Map<string, string> = new Map();
    private leaseTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private readonly workerId = createWorkerId();
    public io: Server | null = null;

    private constructor() {}

    public static getInstance(): WhatsAppManager {
        if (!WhatsAppManager.instance) {
            WhatsAppManager.instance = new WhatsAppManager();
        }
        return WhatsAppManager.instance;
    }

    setup(io: Server) {
        this.io = io;
    }

    async loadSessions() {
        if (!this.io) throw new Error("Socket.IO not initialized in WhatsAppManager");
        const sessions = await prisma.session.findMany({
            where: {
                status: { in: ["CONNECTED", "CONNECTING", "RECONNECTING", "DISCONNECTED"] }
            },
            select: { id: true, sessionId: true, userId: true, status: true }
        });

        let started = 0;
        for (const session of sessions) {
            // Only auto-init sessions that were CONNECTED before (have auth creds)
            const authCount = await prisma.authState.count({
                where: { sessionId: session.sessionId }
            });
            if (!shouldRecoverDevice(session.status, authCount > 0)) {
                // No credentials — session was created but never connected
                // Set to STOPPED so it doesn't spam reconnect
                await prisma.session.update({
                    where: { sessionId: session.sessionId },
                    data: { status: "STOPPED" }
                }).catch(() => {});
                continue;
            }

            if (!(await this.acquireLease(session.sessionId, session.id))) {
                logger.warn("Manager", `Session ${session.sessionId} is already active on another worker.`);
                continue;
            }

            const instance = new WhatsAppInstance(session.sessionId, session.userId, this.io);
            instance.onRemovedFromManager = () => this.removeInstance(session.sessionId);
            this.sessions.set(session.sessionId, instance);
            try {
                await instance.init();
                started++;
            } catch (error) {
                logger.error("Manager", `Failed to recover session ${session.sessionId}`, error);
                await this.releaseLease(session.sessionId);
                this.sessions.delete(session.sessionId);
                await prisma.session.update({
                    where: { id: session.id },
                    data: { status: "FAILED" },
                }).catch(() => undefined);
            }
        }
        logger.success("Manager", `Loaded ${started} sessions (${sessions.length - started} idle skipped).`);
    }

    async createSession(userId: string, role: Role, name: string, customSessionId?: string) {
        if (!this.io && globalForWhatsapp.io) {
            this.io = globalForWhatsapp.io;
        }

        if (!this.io) {
            logger.error("Manager", "Socket.IO not initialized in WhatsAppManager");
            throw new Error("Socket.IO not initialized");
        }

        const sessionId = customSessionId || generateSessionIdentifier();

        const session = await createOwnedSession({ userId, role, name, sessionId });

        // Don't init socket — user clicks Start manually
        logger.info("Manager", `Session ${sessionId} created (STOPPED). User must click Start to connect.`);
        return session;
    }

    public getInstance(sessionId: string) {
        return this.sessions.get(sessionId);
    }

    /** Remove instance from memory manager (cleanup after stop/logout) */
    public removeInstance(sessionId: string) {
        const inst = this.sessions.get(sessionId);
        if (inst) {
            logger.info("Manager", `Removing session ${sessionId} from memory.`);
            this.sessions.delete(sessionId);
        }
        void this.releaseLease(sessionId);
    }

    async deleteSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            await instance.shutdown();
            this.sessions.delete(sessionId);
        }
        await this.releaseLease(sessionId);
        await prisma.$transaction([
            prisma.authState.deleteMany({ where: { sessionId } }),
            prisma.session.delete({ where: { sessionId } }),
        ]);
    }

    async stopSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) {
            await instance.shutdown();
            instance.status = "STOPPED";
            this.io?.to(sessionId).emit("connection.update", { status: "STOPPED", qr: null });
            await prisma.session.update({
                where: { sessionId },
                data: { status: "STOPPED" }
            }).catch(() => {});
            // Remove from memory immediately
            this.sessions.delete(sessionId);
        }
        await prisma.session.update({
            where: { sessionId },
            data: { status: "STOPPED", qr: null },
        }).catch(() => undefined);
        await this.releaseLease(sessionId);
    }

    async startSession(sessionId: string) {
        // If already running, do nothing
        const existingInstance = this.sessions.get(sessionId);
        if (existingInstance && !existingInstance.isStopped) {
            return;
        }

        const session = await prisma.session.findUnique({ where: { sessionId } });
        if (!session) throw new Error("Session not found");
        if (!this.io) throw new Error("Socket.IO not initialized");
        if (!(await this.acquireLease(sessionId, session.id))) {
            throw new Error("Session is already active on another worker");
        }

        // Create fresh instance
        let instance = this.sessions.get(sessionId);
        if (!instance) {
            instance = new WhatsAppInstance(sessionId, session.userId, this.io);
            instance.onRemovedFromManager = () => this.removeInstance(sessionId);
            this.sessions.set(sessionId, instance);
        } else {
            // Reset stopped flag for retry
            instance.isStopped = false;
        }

        try {
            await prisma.session.update({
                where: { id: session.id },
                data: { status: "CONNECTING", qr: null },
            });
            await instance.init();
        } catch (error) {
            this.sessions.delete(sessionId);
            await this.releaseLease(sessionId);
            await prisma.session.update({
                where: { id: session.id },
                data: { status: "FAILED", qr: null },
            }).catch(() => undefined);
            throw error;
        }
    }

    async restartSession(sessionId: string) {
        await this.stopSession(sessionId);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.startSession(sessionId);
    }

    async requestPairingCode(sessionId: string, phoneNumber: string) {
        const instance = this.sessions.get(sessionId);
        if (!instance) throw new Error("Instance not found or not running");
        return await instance.requestPairingCode(phoneNumber);
    }

    async logoutSession(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance?.socket) {
            await instance.socket.logout();
        } else {
            await prisma.$transaction([
                prisma.session.update({
                    where: { sessionId },
                    data: { status: "LOGGED_OUT", qr: null },
                }),
                prisma.authState.deleteMany({ where: { sessionId } }),
            ]);
        }
        this.sessions.delete(sessionId);
        await this.releaseLease(sessionId);
    }

    async shutdownAll() {
        const entries = Array.from(this.sessions.entries());
        await Promise.all(entries.map(async ([sessionId, instance]) => {
            await instance.shutdown();
            await this.releaseLease(sessionId);
        }));
        this.sessions.clear();
    }

    private async acquireLease(sessionId: string, sessionDbId: string): Promise<boolean> {
        const acquired = await acquireSessionRuntimeLock(sessionDbId, this.workerId);
        if (!acquired) return false;

        this.sessionDbIds.set(sessionId, sessionDbId);
        const existingTimer = this.leaseTimers.get(sessionId);
        if (existingTimer) clearInterval(existingTimer);

        const timer = setInterval(async () => {
            try {
                const renewed = await heartbeatSessionRuntimeLock(sessionDbId, this.workerId);
                if (!renewed) {
                    logger.error("Manager", `Lost runtime lease for session ${sessionId}; stopping local instance.`);
                    await this.stopAfterLeaseFailure(sessionId);
                }
            } catch (error) {
                logger.error("Manager", `Failed to renew runtime lease for session ${sessionId}`, error);
                await this.stopAfterLeaseFailure(sessionId);
            }
        }, 15_000);
        timer.unref?.();
        this.leaseTimers.set(sessionId, timer);
        return true;
    }

    private clearLeaseTimer(sessionId: string) {
        const timer = this.leaseTimers.get(sessionId);
        if (timer) clearInterval(timer);
        this.leaseTimers.delete(sessionId);
    }

    private async stopAfterLeaseFailure(sessionId: string) {
        const instance = this.sessions.get(sessionId);
        if (instance) await instance.shutdown();
        this.sessions.delete(sessionId);
        this.clearLeaseTimer(sessionId);
        this.sessionDbIds.delete(sessionId);
        await prisma.session.update({
            where: { sessionId },
            data: { status: "FAILED", qr: null },
        }).catch(() => undefined);
    }

    private async releaseLease(sessionId: string) {
        this.clearLeaseTimer(sessionId);
        const sessionDbId = this.sessionDbIds.get(sessionId);
        this.sessionDbIds.delete(sessionId);
        if (sessionDbId) {
            await releaseSessionRuntimeLock(sessionDbId, this.workerId).catch((error) => {
                logger.error("Manager", `Failed to release runtime lease for session ${sessionId}`, error);
            });
        }
    }
}

const globalForWhatsapp = globalThis as typeof globalThis & {
    io?: Server;
    waManager?: WhatsAppManager;
};

export const waManager = globalForWhatsapp.waManager || WhatsAppManager.getInstance();

globalForWhatsapp.waManager = waManager;
