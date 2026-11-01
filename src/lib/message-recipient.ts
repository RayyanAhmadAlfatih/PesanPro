import { MessageJobError } from "./message-job-errors";

// Nomor seluler lokal Indonesia: "08" diikuti 7-11 digit (total 9-13 digit).
// Tanpa konversi ini, nomor "08…" dipakai apa adanya sebagai JID
// ("08…@s.whatsapp.net") sehingga WhatsApp menerima perintah tetapi pesan
// tidak pernah sampai — job berhenti di status SENT tanpa error.
const LOCAL_INDONESIAN_MOBILE = /^08\d{7,11}$/;
const PHONE_FORMATTING = /[\s\-().]/g;

/**
 * Normalize a phone number for pairing and other non-JID flows.
 *
 * Users paste numbers from contact cards and bank apps, so spaces, dashes,
 * dots, and parentheses are common. The local Indonesian `08…` form is
 * converted to the international `62…` form that Baileys expects. Without
 * this, a pairing code is requested for a number WhatsApp does not recognise
 * and the code never works.
 */
export function normalizePhoneNumber(value: string): string {
  const compact = value.trim().replace(PHONE_FORMATTING, "");
  const digits = compact.replace(/^\+/, "");
  if (!/^\d{8,15}$/.test(digits)) {
    throw new MessageJobError("INVALID_PHONE_NUMBER", "Phone number must contain 8-15 digits", 422, false);
  }
  return LOCAL_INDONESIAN_MOBILE.test(digits) ? `62${digits.slice(1)}` : digits;
}

export function normalizeRecipient(value: string): string {
  const trimmed = value.trim();
  // Formatting characters are only removed for phone candidates. Stripping
  // them from a JID would corrupt a valid `user.name@s.whatsapp.net` address.
  const compact = trimmed.replace(PHONE_FORMATTING, "");
  if (/^\+?\d{7,20}$/.test(compact)) {
    const digits = compact.replace(/^\+/, "");
    const international = LOCAL_INDONESIAN_MOBILE.test(digits) ? `62${digits.slice(1)}` : digits;
    return `${international}@s.whatsapp.net`;
  }
  if (/^[A-Za-z0-9._:-]{3,80}@(s\.whatsapp\.net|g\.us|lid)$/.test(trimmed)) return trimmed;
  throw new MessageJobError("INVALID_RECIPIENT", "Recipient must be a phone number or supported WhatsApp JID", 422, false);
}
