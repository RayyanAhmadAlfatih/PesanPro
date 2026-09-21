import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { MessageJobError } from "./message-job-errors";

export type IntegrationMessageContract = {
  recipient: string;
  message: string;
  sourceId: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export function hashIntegrationToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseIntegrationTokenScopes(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function applyIntegrationMapping(mappingValue: Prisma.JsonValue | null, input: IntegrationMessageContract) {
  if (!mappingValue || typeof mappingValue !== "object" || Array.isArray(mappingValue)) return input;
  const mapping = mappingValue as Record<string, Prisma.JsonValue>;
  const staticRecipient = typeof mapping.staticRecipient === "string" ? mapping.staticRecipient.trim() : "";
  const recipientField = typeof mapping.recipientField === "string" ? mapping.recipientField.trim() : "";
  const template = typeof mapping.messageTemplate === "string" ? mapping.messageTemplate : "{{message}}";
  const metadata = input.metadata ?? {};
  const message = template.replace(/\{\{(?:field:([^{}]+)|([A-Za-z0-9_.-]+))\}\}/g, (_match, fieldKey: string | undefined, key: string | undefined) => {
    if (fieldKey) return String(metadata[`field.${fieldKey.trim()}`] ?? "");
    if (key === "message") return input.message;
    if (key === "sourceId") return input.sourceId;
    const value = key ? metadata[key] : undefined;
    return value === undefined || value === null ? "" : String(value);
  }).trim();
  if (!message || message.length > 4096) throw new MessageJobError("INVALID_MESSAGE", "Mapped integration message must contain 1-4096 characters", 422, false);
  const recipientFromField = recipientField ? metadata[`field.${recipientField}`] : undefined;
  return { ...input, recipient: staticRecipient || (recipientFromField === undefined || recipientFromField === null ? "" : String(recipientFromField)) || input.recipient, message };
}

export function readIntegrationToken(headers: Headers) {
  const direct = headers.get("x-integration-token")?.trim();
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const token = direct || bearer;
  if (!token || !/^ppint_[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new MessageJobError("INVALID_INTEGRATION_TOKEN", "A valid integration token is required", 401, false);
  }
  return token;
}
