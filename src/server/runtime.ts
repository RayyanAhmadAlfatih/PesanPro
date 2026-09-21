import crypto from "node:crypto";
import os from "node:os";
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { setupSocket } from "./socket";
import { waManager } from "../modules/whatsapp/manager";
import { logger } from "../lib/logger";
import { validateEnvOrExit } from "../lib/env";
import pkg from "../../package.json";
import { RuntimeHeartbeatReporter } from "../lib/runtime-heartbeat";
import type { RuntimeProcessType } from "@prisma/client";

const env = validateEnvOrExit();

const dev = env.NODE_ENV !== "production";
const hostname = env.HOSTNAME;
const port = env.PORT;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const { migrateLegacyAuthStateRecords } = await import("../modules/whatsapp/auth/usePrismaAuthState");
  await migrateLegacyAuthStateRecords();

  const heartbeatReporters: RuntimeHeartbeatReporter[] = [];
  const createHeartbeat = async (processType: RuntimeProcessType, instanceId: string, mode: "web" | "embedded") => {
    const reporter = new RuntimeHeartbeatReporter({
      instanceId,
      processType,
      intervalMs: env.RUNTIME_HEARTBEAT_INTERVAL_MS,
      version: pkg.version,
      metadata: () => ({ mode }),
    });
    heartbeatReporters.push(reporter);
    await reporter.start();
    return reporter;
  };
  await createHeartbeat("WEB", `web-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`, "web");

  const server = createServer(async (req, res) => {
    try {
      if (!req.url) return;
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error("Server", "Error handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // CORS restricted to BASE_URL (Gate 0)
  const allowedOrigin = env.BASE_URL ?? `http://${hostname}:${port}`;
  const io = new Server(server, {
    path: "/api/socket/io",
    addTrailingSlash: false,
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  setupSocket(io);
  (global as unknown as { io: Server }).io = io;

  waManager.setup(io);
  await waManager.loadSessions();

  let messageWorker: import("../worker/message-worker").MessageQueueWorker | null = null;
  if (env.MESSAGE_WORKER_MODE === "embedded") {
    const [{ MessageQueueWorker }, { dispatchQueuedMessage }] = await Promise.all([
      import("../worker/message-worker"),
      import("../modules/whatsapp/message-adapter"),
    ]);
    const workerId = `embedded-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    const healthReporter = await createHeartbeat("MESSAGE_WORKER", workerId, "embedded");
    messageWorker = new MessageQueueWorker({
      workerId,
      dispatcher: dispatchQueuedMessage,
      pollMs: env.MESSAGE_WORKER_POLL_MS,
      leaseMs: env.MESSAGE_WORKER_LEASE_MS,
      healthReporter,
    });
    messageWorker.start();
  }

  let scheduleWorker: import("../scheduler/schedule-worker").ScheduleWorker | null = null;
  if (env.SCHEDULE_WORKER_MODE === "embedded") {
    const { ScheduleWorker } = await import("../scheduler/schedule-worker");
    const workerId = `embedded-scheduler-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    const healthReporter = await createHeartbeat("SCHEDULE_WORKER", workerId, "embedded");
    scheduleWorker = new ScheduleWorker({
      workerId,
      pollMs: env.SCHEDULE_WORKER_POLL_MS,
      leaseMs: env.SCHEDULE_WORKER_LEASE_MS,
      healthReporter,
    });
    scheduleWorker.start();
  }

  let broadcastWorker: import("../broadcast/broadcast-worker").BroadcastWorker | null = null;
  if (env.BROADCAST_WORKER_MODE === "embedded") {
    const { BroadcastWorker } = await import("../broadcast/broadcast-worker");
    const workerId = `embedded-broadcast-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    const healthReporter = await createHeartbeat("BROADCAST_WORKER", workerId, "embedded");
    broadcastWorker = new BroadcastWorker({
      workerId,
      pollMs: env.BROADCAST_WORKER_POLL_MS,
      leaseMs: env.BROADCAST_WORKER_LEASE_MS,
      healthReporter,
    });
    broadcastWorker.start();
  }

  let campaignWorker: import("../campaign/campaign-worker").CampaignWorker | null = null;
  if (env.CAMPAIGN_WORKER_MODE === "embedded") {
    const { CampaignWorker } = await import("../campaign/campaign-worker");
    const workerId = `embedded-campaign-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    const healthReporter = await createHeartbeat("CAMPAIGN_WORKER", workerId, "embedded");
    campaignWorker = new CampaignWorker({
      workerId,
      pollMs: env.CAMPAIGN_WORKER_POLL_MS,
      leaseMs: env.CAMPAIGN_WORKER_LEASE_MS,
      healthReporter,
    });
    campaignWorker.start();
  }

  let autoReplyWorker: import("../autoreply/autoreply-worker").AutoReplyWorker | null = null;
  if (env.AUTOREPLY_WORKER_MODE === "embedded") {
    const { AutoReplyWorker } = await import("../autoreply/autoreply-worker");
    const workerId = `embedded-autoreply-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    const healthReporter = await createHeartbeat("AUTOREPLY_WORKER", workerId, "embedded");
    autoReplyWorker = new AutoReplyWorker({
      workerId,
      pollMs: env.AUTOREPLY_WORKER_POLL_MS,
      leaseMs: env.AUTOREPLY_WORKER_LEASE_MS,
      healthReporter,
    });
    autoReplyWorker.start();
  }

  let webhookWorker: import("../webhook/webhook-worker").WebhookWorker | null = null;
  if (env.WEBHOOK_WORKER_MODE === "embedded") {
    const { WebhookWorker } = await import("../webhook/webhook-worker");
    const workerId = `embedded-webhook-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    const healthReporter = await createHeartbeat("WEBHOOK_WORKER", workerId, "embedded");
    webhookWorker = new WebhookWorker({
      workerId,
      pollMs: env.WEBHOOK_WORKER_POLL_MS,
      leaseMs: env.WEBHOOK_WORKER_LEASE_MS,
      healthReporter,
    });
    webhookWorker.start();
  }

  server.keepAliveTimeout = 120 * 1000;
  server.headersTimeout = 120 * 1000;

  server.listen(port, () => {
    logger.banner("PESANPRO", pkg.version, port);
    logger.info("Server", `CORS origin: ${allowedOrigin}`);
    logger.info("Server", `Message worker mode: ${env.MESSAGE_WORKER_MODE}`);
    logger.info("Server", `Schedule worker mode: ${env.SCHEDULE_WORKER_MODE}`);
    logger.info("Server", `Broadcast worker mode: ${env.BROADCAST_WORKER_MODE}`);
    logger.info("Server", `Campaign worker mode: ${env.CAMPAIGN_WORKER_MODE}`);
    logger.info("Server", `Auto-reply worker mode: ${env.AUTOREPLY_WORKER_MODE}`);
    logger.info("Server", `Webhook worker mode: ${env.WEBHOOK_WORKER_MODE}`);
  });

  const operationalScan = setInterval(() => {
    void import("../lib/operations")
      .then(({ collectOperationalSnapshot }) => collectOperationalSnapshot({ persistAlerts: true }))
      .catch((error) => logger.error("Operations", "Periodic operational scan failed", error));
  }, 60_000);
  operationalScan.unref?.();

  const runMaintenance = () => {
    void import("../lib/operations-maintenance")
      .then(({ runOperationalMaintenance }) => runOperationalMaintenance())
      .then((result) => logger.info("Operations", "Daily retention maintenance complete", result))
      .catch((error) => logger.error("Operations", "Daily retention maintenance failed", error));
  };
  const initialMaintenance = setTimeout(runMaintenance, 30_000);
  initialMaintenance.unref?.();
  const dailyMaintenance = setInterval(runMaintenance, 86_400_000);
  dailyMaintenance.unref?.();

  // Graceful shutdown (Gate 0)
  const shutdown = async (signal: string) => {
    logger.info("Server", `Received ${signal}, shutting down gracefully...`);
    try {
      clearInterval(operationalScan);
      clearTimeout(initialMaintenance);
      clearInterval(dailyMaintenance);
      await webhookWorker?.stop();
      await autoReplyWorker?.stop();
      await campaignWorker?.stop();
      await broadcastWorker?.stop();
      await scheduleWorker?.stop();
      await messageWorker?.stop();
      for (const reporter of heartbeatReporters.reverse()) await reporter.stop();
      io.close();
      await waManager.shutdownAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const { prisma } = await import("../lib/prisma");
      await prisma.$disconnect();
      logger.success("Server", "Graceful shutdown complete");
      process.exit(0);
    } catch (e) {
      logger.error("Server", "Error during shutdown:", e);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}).catch((error) => {
  logger.error("Server", "Startup failed", error);
  process.exit(1);
});
