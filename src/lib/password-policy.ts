import crypto from "crypto";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export function generatePasswordResetSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPasswordResetSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}
