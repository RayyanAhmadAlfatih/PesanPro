import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

import crypto from "node:crypto";
import os from "node:os";
import { validateEnvOrExit } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { BroadcastWorker } from "./broadcast-worker";
import { RuntimeHeartbeatReporter } from "@/lib/runtime-heartbeat";

const env = validateEnvOrExit();
if (env.BROADCAST_WORKER_MODE !== "external") {
  logger.error("BroadcastWorker", "Standalone broadcast worker requires BROADCAST_WORKER_MODE=external");
  process.exit(1);
}
const workerId = `broadcast-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
const heartbeat = new RuntimeHeartbeatReporter({ instanceId: workerId, processType: "BROADCAST_WORKER", intervalMs: env.RUNTIME_HEARTBEAT_INTERVAL_MS, version: process.env.npm_package_version, metadata: () => ({ mode: "external" }) });
await heartbeat.start();
const worker = new BroadcastWorker({
  workerId,
  pollMs: env.BROADCAST_WORKER_POLL_MS,
  leaseMs: env.BROADCAST_WORKER_LEASE_MS,
  healthReporter: heartbeat,
});
worker.start();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("BroadcastWorker", `Received ${signal}`);
  await worker.stop();
  await heartbeat.stop();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
