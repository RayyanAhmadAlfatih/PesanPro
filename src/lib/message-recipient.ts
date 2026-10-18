import { MessageJobError } from "./message-job-errors";

// Nomor seluler lokal Indonesia: "08" diikuti 7-11 digit (total 9-13 digit).
// Tanpa konversi ini, nomor "08…" dipakai apa adanya sebagai JID
// ("08…@s.whatsapp.net") sehingga WhatsApp menerima perintah tetapi pesan
// tidak pernah sampai — job berhenti di status SENT tanpa error.
const LOCAL_INDONESIAN_MOBILE = /^08\d{7,11}$/;

export function normalizeRecipient(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (/^\+?\d{7,20}$/.test(trimmed)) {
    const digits = trimmed.replace(/^\+/, "");
    const international = LOCAL_INDONESIAN_MOBILE.test(digits) ? `62${digits.slice(1)}` : digits;
    return `${international}@s.whatsapp.net`;
  }
  if (/^[A-Za-z0-9._:-]{3,80}@(s\.whatsapp\.net|g\.us|lid)$/.test(trimmed)) return trimmed;
  throw new MessageJobError("INVALID_RECIPIENT", "Recipient must be a phone number or supported WhatsApp JID", 422, false);
}
