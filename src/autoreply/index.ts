import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

import crypto from "node:crypto";
import os from "node:os";
import { validateEnvOrExit } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AutoReplyWorker } from "./autoreply-worker";
import { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

const env = validateEnvOrExit();
if (env.AUTOREPLY_WORKER_MODE !== "external") {
  logger.error("AutoReplyWorker", "Standalone auto-reply worker requires AUTOREPLY_WORKER_MODE=external");
  process.exit(1);
}
const workerId = `autoreply-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
const heartbeat = new RuntimeHeartbeatReporter({ instanceId: workerId, processType: "AUTOREPLY_WORKER", intervalMs: env.RUNTIME_HEARTBEAT_INTERVAL_MS, version: process.env.npm_package_version, metadata: () => ({ mode: "external" }) });
await heartbeat.start();
const worker = new AutoReplyWorker({
  workerId,
  pollMs: env.AUTOREPLY_WORKER_POLL_MS,
  leaseMs: env.AUTOREPLY_WORKER_LEASE_MS,
  healthReporter: heartbeat,
});
worker.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("AutoReplyWorker", `Received ${signal}`);
  await worker.stop();
  await heartbeat.stop();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
