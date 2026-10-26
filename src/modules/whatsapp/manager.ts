import { prisma } from "@/lib/prisma";
import { WhatsAppInstance } from "./instance";
import { Server } from "socket.io";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import type { Role } from "@prisma/client";
import { createOwnedSession } from "@/lib/session-service";
import { shouldRecoverDevice } from "@/lib/device-policy";
import { notifySessionOwner } from "@/lib/session-alerts";
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
    private reconcileTimer: ReturnType<typeof setInterval> | null = null;
    private reconciling = false;
    /** Bounded retry state for sessions the runtime marked FAILED. */
    private failedRecovery: Map<string, { attempts: number; nextAttemptAt: number; alerted: boolean }> = new Map();
    private static readonly FAILED_RECOVERY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000];
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
        this.startReconciliation();
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

    /**
     * The database status can outlive the in-memory instance when the database
     * is unavailable exactly while the runtime lease is lost. Without this
     * loop the session stays CONNECTED forever while every send fails with
     * SESSION_NOT_READY. A missing instance is re-initialised here; a lease
     * held by another worker is left alone.
     *
     * A session that already flipped to FAILED is retried too, with growing
     * delays, because that status is written by the runtime itself (lease loss,
     * failed start) and nothing else would ever bring the device back. The
     * owner is told once the retries keep failing, so the device is never down
     * without anybody noticing.
     */
    async reconcileSessions() {
        if (this.reconciling || !this.io) return;
        this.reconciling = true;
        try {
            const sessions = await prisma.session.findMany({
                where: { status: { in: ["CONNECTED", "FAILED"] } },
                select: { id: true, sessionId: true, status: true, userId: true },
            });
            for (const session of sessions) {
                if (this.sessions.has(session.sessionId)) continue;
                const authCount = await prisma.authState.count({ where: { sessionId: session.sessionId } });
                if (authCount === 0) continue;
                if (session.status === "FAILED" && !this.reserveFailedRecovery(session.sessionId)) continue;
                try {
                    await this.startSession(session.sessionId);
                    this.failedRecovery.delete(session.sessionId);
                    logger.warn("Manager", `Reconciled missing session ${session.sessionId}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "";
                    if (message.includes("already active on another worker")) continue;
                    logger.error("Manager", `Failed to reconcile session ${session.sessionId}`, error);
                    if (session.status === "FAILED") {
                        await this.alertFailedRecovery(session.sessionId, session.userId);
                    }
                }
            }
        } catch (error) {
            logger.error("Manager", "Session reconciliation failed", error);
        } finally {
            this.reconciling = false;
        }
    }

    /**
     * Decide whether a FAILED session may be retried now. Retries back off so a
     * permanently broken device cannot hammer WhatsApp, but they never stop
     * completely: the last delay repeats once an hour.
     */
    private reserveFailedRecovery(sessionId: string): boolean {
        const now = Date.now();
        const state = this.failedRecovery.get(sessionId) ?? { attempts: 0, nextAttemptAt: 0, alerted: false };
        if (now < state.nextAttemptAt) return false;
        const delays = WhatsAppManager.FAILED_RECOVERY_DELAYS_MS;
        state.attempts += 1;
        state.nextAttemptAt = now + delays[Math.min(state.attempts - 1, delays.length - 1)];
        this.failedRecovery.set(sessionId, state);
        return true;
    }

    /** Tell the owner once, after the third unsuccessful automatic retry. */
    private async alertFailedRecovery(sessionId: string, userId: string) {
        const state = this.failedRecovery.get(sessionId);
        if (!state || state.alerted || state.attempts < 3) return;
        state.alerted = true;
        await notifySessionOwner({ userId, sessionId, kind: "FAILED" });
    }

    private startReconciliation(intervalMs = 60_000) {
        if (this.reconcileTimer) return;
        this.reconcileTimer = setInterval(() => {
            void this.reconcileSessions();
        }, intervalMs);
        this.reconcileTimer.unref?.();
    }

    /** Retry the status write so a transient database outage cannot leave a stale CONNECTED row. */
    private async persistSessionStatus(sessionId: string, status: "FAILED" | "STOPPED", attempts = 3) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                await prisma.session.update({ where: { sessionId }, data: { status, qr: null } });
                return true;
            } catch (error) {
                logger.error("Manager", `Failed to persist ${status} for session ${sessionId} (attempt ${attempt}/${attempts})`, error);
                if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
            }
        }
        return false;
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
            // Owner-initiated logout is not an incident; skip the LOGGED_OUT alert.
            instance.isLoggingOut = true;
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
        await this.persistSessionStatus(sessionId, "FAILED");
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
