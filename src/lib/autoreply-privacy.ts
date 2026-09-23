export const REDACTED_AUTOREPLY_SENDER = "[redacted]";

export const minimizedSkippedAutoReplyData = {
  sourceText: null,
  senderJid: REDACTED_AUTOREPLY_SENDER,
} as const;

export function maskAutoReplyJid(value: string) {
  if (!value || value === REDACTED_AUTOREPLY_SENDER) return REDACTED_AUTOREPLY_SENDER;
  const separator = value.indexOf("@");
  const local = separator >= 0 ? value.slice(0, separator) : value;
  const domain = separator >= 0 ? value.slice(separator) : "";
  if (local.length <= 6) return `${local.slice(0, 1)}•••${local.slice(-1)}${domain}`;
  return `${local.slice(0, 3)}••••${local.slice(-3)}${domain}`;
}
