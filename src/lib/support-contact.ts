/**
 * Normalise an Indonesian WhatsApp number into the digits-only form wa.me
 * expects. Operators type numbers in every shape: 0812..., +62 812-...,
 * 62812..., or even 812... without a prefix.
 */
export function normalizeWhatsappNumber(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("620")) return `62${digits.slice(3)}`;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function formatWhatsappDisplay(raw: string | null | undefined): string {
  const number = normalizeWhatsappNumber(raw);
  if (!number) return "";
  if (number.length >= 10) {
    return `+${number.slice(0, 2)} ${number.slice(2, 5)}-${number.slice(5, 9)}-${number.slice(9)}`;
  }
  return `+${number}`;
}

export function whatsappHref(raw: string | null | undefined, message?: string): string | null {
  const number = normalizeWhatsappNumber(raw);
  if (!number) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${number}${query}`;
}
