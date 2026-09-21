import type { BotConfig, Prisma } from "@prisma/client";

function getStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getAutoReplyAccessReason(
  config: Pick<BotConfig, "enabled" | "autoReplyMode" | "autoReplyAllowedJids" | "autoReplyBlockedJids"> | null,
  senderJid: string,
) {
  if (config?.enabled === false) return "BOT_DISABLED";
  const mode = config?.autoReplyMode ?? "ALL";
  if (mode === "OWNER") return "OWNER_MODE_IGNORES_INBOUND";
  if (mode === "SPECIFIC" && !getStringArray(config?.autoReplyAllowedJids).includes(senderJid)) return "SENDER_NOT_ALLOWED";
  if (mode === "BLACKLIST" && getStringArray(config?.autoReplyBlockedJids).includes(senderJid)) return "SENDER_BLOCKED";
  return null;
}
