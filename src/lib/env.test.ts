import { afterEach, describe, expect, it } from "vitest";
import { _resetEnvCache, getEnv } from "./env";

const keys = [
  "DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "BASE_URL", "PASSWORD_RESET_BASE_URL",
  "RESEND_API_KEY", "PASSWORD_RESET_FROM", "MESSAGE_WORKER_MODE", "MESSAGE_WORKER_SECRET",
  "BACKUP_ENCRYPTION_PASSPHRASE", "MEDIA_STORAGE_DRIVER", "B2_ACCOUNT_ID", "B2_ACCOUNT_KEY",
  "B2_BUCKET", "B2_ENDPOINT",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function setRequiredEnvironment() {
  process.env.DATABASE_URL = "mysql://user:password@127.0.0.1:3306/pesanpro";
  process.env.AUTH_SECRET = "a".repeat(32);
  process.env.ENCRYPTION_KEY = "b".repeat(64);
  process.env.MESSAGE_WORKER_MODE = "embedded";
}

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  _resetEnvCache();
});

describe("environment optional secrets", () => {
  it("treats blank optional values from .env templates as unset", () => {
    setRequiredEnvironment();
    process.env.BASE_URL = "";
    process.env.PASSWORD_RESET_BASE_URL = "";
    process.env.RESEND_API_KEY = "";
    process.env.PASSWORD_RESET_FROM = "";
    process.env.MESSAGE_WORKER_SECRET = "";
    process.env.BACKUP_ENCRYPTION_PASSPHRASE = "";
    _resetEnvCache();

    const env = getEnv();
    expect(env.BASE_URL).toBeUndefined();
    expect(env.MESSAGE_WORKER_SECRET).toBeUndefined();
    expect(env.BACKUP_ENCRYPTION_PASSPHRASE).toBeUndefined();
  });

  it("still requires a worker secret in external mode", () => {
    setRequiredEnvironment();
    process.env.MESSAGE_WORKER_MODE = "external";
    process.env.MESSAGE_WORKER_SECRET = "";
    _resetEnvCache();

    expect(() => getEnv()).toThrow(/MESSAGE_WORKER_SECRET/);
  });

  it("requires every B2 credential when the B2 driver is enabled", () => {
    setRequiredEnvironment();
    process.env.MEDIA_STORAGE_DRIVER = "b2";
    process.env.B2_ACCOUNT_ID = "";
    process.env.B2_ACCOUNT_KEY = "";
    process.env.B2_BUCKET = "";
    process.env.B2_ENDPOINT = "";
    _resetEnvCache();

    expect(() => getEnv()).toThrow(/B2_ACCOUNT_ID/);
  });

  it("requires a sender when SMTP delivery is enabled", () => {
    setRequiredEnvironment();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "";
    _resetEnvCache();

    expect(() => getEnv()).toThrow(/SMTP_FROM/);
  });

  it("requires SMTP credentials as a pair", () => {
    setRequiredEnvironment();
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "PesanPro <no-reply@example.com>";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASSWORD = "";
    _resetEnvCache();

    expect(() => getEnv()).toThrow(/SMTP_PASSWORD/);
  });
});
