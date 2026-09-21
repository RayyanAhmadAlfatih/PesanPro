import os from "node:os";
import type { Prisma, RuntimeProcessStatus, RuntimeProcessType } from "@prisma/client";
import { logger } from "./logger";
import { prisma } from "./prisma";

type HeartbeatMetadata = Prisma.InputJsonValue | undefined;

export type RuntimeHeartbeatRepository = {
  upsert(input: {
    instanceId: string;
    processType: RuntimeProcessType;
    status: RuntimeProcessStatus;
    hostname: string;
    pid: number;
    version?: string;
    startedAt: Date;
    heartbeatAt: Date;
    metadata?: HeartbeatMetadata;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  }): Promise<void>;
  stop(instanceId: string, stoppedAt: Date): Promise<void>;
};

export const prismaRuntimeHeartbeatRepository: RuntimeHeartbeatRepository = {
  async upsert(input) {
    await prisma.runtimeHeartbeat.upsert({
      where: { instanceId: input.instanceId },
      update: {
        status: input.status,
        heartbeatAt: input.heartbeatAt,
        stoppedAt: null,
        metadata: input.metadata,
        lastErrorCode: input.lastErrorCode,
        lastErrorMessage: input.lastErrorMessage,
      },
      create: input,
    });
  },
  async stop(instanceId, stoppedAt) {
    await prisma.runtimeHeartbeat.updateMany({
      where: { instanceId },
      data: { status: "STOPPING", heartbeatAt: stoppedAt, stoppedAt },
    });
  },
};

export class RuntimeHeartbeatReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly startedAt = new Date();
  private status: RuntimeProcessStatus = "STARTING";
  private lastErrorCode: string | null = null;
  private lastErrorMessage: string | null = null;

  constructor(private readonly options: {
    instanceId: string;
    processType: RuntimeProcessType;
    intervalMs: number;
    version?: string;
    metadata?: () => HeartbeatMetadata;
    repository?: RuntimeHeartbeatRepository;
    now?: () => Date;
  }) {}

  async start() {
    if (this.timer) return;
    await this.safeWrite("STARTING");
    this.status = "HEALTHY";
    await this.safeWrite("HEALTHY");
    this.timer = setInterval(() => void this.safeWrite(this.status), this.options.intervalMs);
    this.timer.unref?.();
  }

  async reportError(code: string, error: unknown) {
    if (this.status === "DEGRADED" && this.lastErrorCode === code) return;
    this.status = "DEGRADED";
    this.lastErrorCode = code.slice(0, 191);
    this.lastErrorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    await this.safeWrite("DEGRADED");
  }

  async markHealthy() {
    if (this.status === "HEALTHY" && !this.lastErrorCode) return;
    this.status = "HEALTHY";
    this.lastErrorCode = null;
    this.lastErrorMessage = null;
    await this.safeWrite("HEALTHY");
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      await (this.options.repository ?? prismaRuntimeHeartbeatRepository).stop(this.options.instanceId, this.now());
    } catch (error) {
      logger.error("Heartbeat", `Failed to stop ${this.options.instanceId}`, error);
    }
  }

  private now() {
    return this.options.now?.() ?? new Date();
  }

  private async safeWrite(status: RuntimeProcessStatus) {
    try {
      await (this.options.repository ?? prismaRuntimeHeartbeatRepository).upsert({
        instanceId: this.options.instanceId,
        processType: this.options.processType,
        status,
        hostname: os.hostname(),
        pid: process.pid,
        version: this.options.version,
        startedAt: this.startedAt,
        heartbeatAt: this.now(),
        metadata: this.options.metadata?.(),
        lastErrorCode: this.lastErrorCode,
        lastErrorMessage: this.lastErrorMessage,
      });
    } catch (error) {
      logger.error("Heartbeat", `Failed to report ${this.options.instanceId}`, error);
    }
  }
}
