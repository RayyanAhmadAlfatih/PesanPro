import { z } from "zod";

const optionalString = (schema: z.ZodString) => z.preprocess(
  (value) => value === "" ? undefined : value,
  schema.optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOSTNAME: z.string().default("localhost"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  BASE_URL: optionalString(z.string().url()),
  PASSWORD_RESET_BASE_URL: optionalString(z.string().url()),
  RESEND_API_KEY: optionalString(z.string().min(1)),
  PASSWORD_RESET_FROM: optionalString(z.string().min(3)),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes) — generate with: openssl rand -hex 32"),
  BAILEYS_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("error"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(50),
  PRIVATE_MEDIA_PATH: z.string().min(1).default("data/private-media"),
  PRIVATE_MEDIA_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(30),
  MESSAGE_WORKER_MODE: z.enum(["embedded", "external", "disabled"]).default("embedded"),
  MESSAGE_WORKER_SECRET: optionalString(z.string().min(32)),
  MESSAGE_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  MESSAGE_WORKER_LEASE_MS: z.coerce.number().int().min(5000).max(300_000).default(30_000),
  SCHEDULE_WORKER_MODE: z.enum(["embedded", "external", "disabled"]).default("embedded"),
  SCHEDULE_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  SCHEDULE_WORKER_LEASE_MS: z.coerce.number().int().min(5000).max(300_000).default(30_000),
  BROADCAST_WORKER_MODE: z.enum(["embedded", "external", "disabled"]).default("embedded"),
  BROADCAST_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  BROADCAST_WORKER_LEASE_MS: z.coerce.number().int().min(5000).max(300_000).default(30_000),
  CAMPAIGN_WORKER_MODE: z.enum(["embedded", "external", "disabled"]).default("embedded"),
  CAMPAIGN_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  CAMPAIGN_WORKER_LEASE_MS: z.coerce.number().int().min(5000).max(300_000).default(30_000),
  AUTOREPLY_WORKER_MODE: z.enum(["embedded", "external", "disabled"]).default("embedded"),
  AUTOREPLY_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  AUTOREPLY_WORKER_LEASE_MS: z.coerce.number().int().min(5000).max(300_000).default(30_000),
  AUTOREPLY_TRIGGER_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  WEBHOOK_WORKER_MODE: z.enum(["embedded", "external", "disabled"]).default("embedded"),
  WEBHOOK_WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  WEBHOOK_WORKER_LEASE_MS: z.coerce.number().int().min(5000).max(300_000).default(30_000),
  ALLOW_INSECURE_WEBHOOKS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  RUNTIME_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(5000).max(60_000).default(15_000),
  RUNTIME_HEARTBEAT_STALE_MS: z.coerce.number().int().min(15_000).max(300_000).default(90_000),
  OPS_ALERT_COOLDOWN_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(300_000),
  OPS_QUEUE_WARNING_AGE_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(300_000),
  OPS_QUEUE_CRITICAL_AGE_MS: z.coerce.number().int().min(60_000).max(604_800_000).default(1_800_000),
  OPS_DISK_WARNING_PERCENT: z.coerce.number().min(1).max(99).default(80),
  OPS_DISK_CRITICAL_PERCENT: z.coerce.number().min(1).max(100).default(90),
  OPS_DATABASE_WARNING_MS: z.coerce.number().int().min(50).max(30_000).default(500),
  OPS_DATABASE_CRITICAL_MS: z.coerce.number().int().min(100).max(60_000).default(2000),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
  BACKUP_DIR: z.string().min(1).default("backups"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  BACKUP_ENCRYPTION_PASSPHRASE: optionalString(z.string().min(32)),
  MONTHLY_INFRA_COST_IDR: z.coerce.number().nonnegative().default(0),
  ENABLE_RATE_LIMITING: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  TZ: z.string().default("Asia/Jakarta"),
}).superRefine((env, context) => {
  if (env.MESSAGE_WORKER_MODE === "external" && !env.MESSAGE_WORKER_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["MESSAGE_WORKER_SECRET"],
      message: "MESSAGE_WORKER_SECRET is required when MESSAGE_WORKER_MODE=external",
    });
  }
  if (env.OPS_QUEUE_CRITICAL_AGE_MS <= env.OPS_QUEUE_WARNING_AGE_MS) {
    context.addIssue({ code: "custom", path: ["OPS_QUEUE_CRITICAL_AGE_MS"], message: "Critical queue age must be greater than warning age" });
  }
  if (env.OPS_DISK_CRITICAL_PERCENT <= env.OPS_DISK_WARNING_PERCENT) {
    context.addIssue({ code: "custom", path: ["OPS_DISK_CRITICAL_PERCENT"], message: "Critical disk percentage must be greater than warning percentage" });
  }
  if (env.OPS_DATABASE_CRITICAL_MS <= env.OPS_DATABASE_WARNING_MS) {
    context.addIssue({ code: "custom", path: ["OPS_DATABASE_CRITICAL_MS"], message: "Critical database latency must be greater than warning latency" });
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;
let validationError: string | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    validationError = `Environment validation failed:\n${issues}`;
    throw new Error(validationError);
  }
  cached = parsed.data as Env;
  return cached;
}

export function validateEnvOrExit(): Env {
  try {
    return getEnv();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Use console.error directly to avoid circular logger dependency
    console.error("\n[ENV] " + msg);
    console.error("\n[ENV] Please check your .env file. See .env.example for reference.");
    console.error("[ENV] Generate ENCRYPTION_KEY: openssl rand -hex 32");
    console.error("[ENV] Generate AUTH_SECRET: openssl rand -base64 32\n");
    process.exit(1);
  }
}

/** For testing — reset cache */
export function _resetEnvCache() {
  cached = null;
  validationError = null;
}

export function getValidationError(): string | null {
  return validationError;
}
