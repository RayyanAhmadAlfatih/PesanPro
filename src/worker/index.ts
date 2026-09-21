import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

import os from "node:os";
import crypto from "node:crypto";
import { getEnv, validateEnvOrExit } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { MessageQueueWorker, type MessageDispatcher } from "./message-worker";
import { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

const env = validateEnvOrExit();
if (env.MESSAGE_WORKER_MODE !== "external") {
  logger.error("MessageWorker", "Standalone worker requires MESSAGE_WORKER_MODE=external");
  process.exit(1);
}

const dispatcher: MessageDispatcher = async (job) => {
  const secret = getEnv().MESSAGE_WORKER_SECRET;
  if (!secret) throw new Error("MESSAGE_WORKER_SECRET is not configured");
  const response = await fetch(new URL("/api/internal/message-dispatch", getEnv().BASE_URL ?? `http://${getEnv().HOSTNAME}:${getEnv().PORT}`), {
    method: "POST",
    headers: { "content-type": "application/json", "x-message-worker-secret": secret },
    body: JSON.stringify({ jobId: job.id, claimToken: job.claimToken }),
    signal: AbortSignal.timeout(Math.max(10_000, getEnv().MESSAGE_WORKER_LEASE_MS - 1000)),
  });
  const payload = await response.json() as { data?: { whatsappMessageId?: string }; error?: { message?: string } };
  if (!response.ok || !payload.data?.whatsappMessageId) throw new Error(payload.error?.message || `Internal dispatch failed with HTTP ${response.status}`);
  return { whatsappMessageId: payload.data.whatsappMessageId };
};

const workerId = `external-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
const heartbeat = new RuntimeHeartbeatReporter({
  instanceId: workerId,
  processType: "MESSAGE_WORKER",
  intervalMs: env.RUNTIME_HEARTBEAT_INTERVAL_MS,
  version: process.env.npm_package_version,
  metadata: () => ({ mode: "external" }),
});
await heartbeat.start();
const worker = new MessageQueueWorker({
  workerId,
  dispatcher,
  pollMs: env.MESSAGE_WORKER_POLL_MS,
  leaseMs: env.MESSAGE_WORKER_LEASE_MS,
  healthReporter: heartbeat,
});
worker.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("MessageWorker", `Received ${signal}`);
  await worker.stop();
  await heartbeat.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
