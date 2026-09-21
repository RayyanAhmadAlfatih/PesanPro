import { MessageJobError } from "./message-job-errors";

export function normalizeRecipient(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (/^\+?\d{7,20}$/.test(trimmed)) return `${trimmed.replace(/^\+/, "")}@s.whatsapp.net`;
  if (/^[A-Za-z0-9._:-]{3,80}@(s\.whatsapp\.net|g\.us|lid)$/.test(trimmed)) return trimmed;
  throw new MessageJobError("INVALID_RECIPIENT", "Recipient must be a phone number or supported WhatsApp JID", 422, false);
}
