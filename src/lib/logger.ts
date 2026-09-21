const REDACTED = "[REDACTED]";
const SECRET_KEY = /(?:authorization|cookie|password|passwd|secret|token|api.?key|encryption.?key|auth.?tag|ciphertext|private.?key)/i;
const TOKEN_PATTERNS = [
  /\bBearer\s+[^\s,;]+/gi,
  /\bppint_[A-Za-z0-9_-]{20,}\b/g,
  /\bwhsec_[A-Za-z0-9_-]{16,}\b/g,
  /\bppk_[A-Za-z0-9_-]{20,}\b/g,
  /mysql:\/\/[^\s/@:]+:[^\s/@]+@/gi,
];

function redactString(value: string) {
  return TOKEN_PATTERNS.reduce((current, pattern, index) => {
    if (index === TOKEN_PATTERNS.length - 1) return current.replace(pattern, "mysql://[REDACTED]@");
    return current.replace(pattern, REDACTED);
  }, value);
}

export function redactLogValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(process.env.NODE_ENV === "production" ? {} : { stack: redactString(value.stack ?? "") }),
    };
  }
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, depth + 1, seen));

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? REDACTED : redactLogValue(item, depth + 1, seen),
  ]));
}

export function createStructuredLogRecord(level: string, tag: string, args: unknown[], now = new Date()) {
  const safeArgs = args.map((item) => redactLogValue(item));
  return {
    timestamp: now.toISOString(),
    level,
    tag: redactString(tag),
    message: safeArgs.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" "),
  };
}

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function emit(level: "info" | "success" | "warn" | "error" | "debug", tag: string, args: unknown[]) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const record = createStructuredLogRecord(level === "success" ? "info" : level, tag, args);
  const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.NODE_ENV === "production") {
    method(JSON.stringify(record));
    return;
  }
  const color = level === "error" ? colors.red : level === "warn" ? colors.yellow : level === "success" ? colors.green : level === "debug" ? colors.magenta : colors.cyan;
  method(`${colors.dim}${record.timestamp}${colors.reset} ${color}${record.level.toUpperCase()}${colors.reset} [${record.tag}] ${record.message}`);
}

export const logger = {
  info: (tag: string, ...args: unknown[]) => emit("info", tag, args),
  success: (tag: string, ...args: unknown[]) => emit("success", tag, args),
  warn: (tag: string, ...args: unknown[]) => emit("warn", tag, args),
  error: (tag: string, ...args: unknown[]) => emit("error", tag, args),
  debug: (tag: string, ...args: unknown[]) => emit("debug", tag, args),
  banner(name: string, version: string, port: number | string) {
    emit("info", "Startup", [{ name, version, port, node: process.version, environment: process.env.NODE_ENV ?? "development" }]);
  },
};
