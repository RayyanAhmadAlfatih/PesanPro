import { formatWhatsappDisplay, normalizeWhatsappNumber } from "./support-contact";

// Nomor WhatsApp KONTAK pemilik akun (bukan nomor device gateway).
//
// Normalisasi memakai normalizeWhatsappNumber() yang sudah ada (08…, 62…,
// +62…, dan 8… tanpa prefix diterima; hasilnya selalu diawali "62").
// Aturan panjangnya mengikuti aturan nomor seluler Indonesia yang sudah
// dipakai untuk device di src/lib/message-recipient.ts: "08" diikuti 7-11
// digit (total 9-13 digit), yang dalam bentuk internasional menjadi
// 62 + 8 + 7-11 digit (total 10-14 digit) dan selalu berawalan 8 setelah 62.
// Nomor bukan seluler Indonesia (mis. 021…) ditolak.
const NORMALIZED_INDONESIAN_MOBILE = /^628\d{7,11}$/;
const FORBIDDEN_CHARS = /[a-zA-Z]/;

export type ParsedUserWhatsapp =
  | { ok: true; normalized: string; display: string }
  | { ok: false; reason: string };

/**
 * Validasi nomor WhatsApp kontak user di satu tempat, dipakai bersama oleh
 * halaman daftar dan checkout/perpanjangan supaya aturannya tidak pernah
 * berbeda. Hasilnya adalah nomor bentuk 62… siap simpan dan tampilan +62 …
 * siap render.
 */
export function parseUserWhatsapp(raw: string | null | undefined): ParsedUserWhatsapp {
  const value = (raw ?? "").trim();
  if (!value) {
    return { ok: false, reason: "Nomor WhatsApp wajib diisi." };
  }
  if (FORBIDDEN_CHARS.test(value)) {
    return {
      ok: false,
      reason: "Nomor WhatsApp hanya boleh berisi angka, spasi, tanda +, -, atau titik.",
    };
  }
  const normalized = normalizeWhatsappNumber(value);
  if (!NORMALIZED_INDONESIAN_MOBILE.test(normalized)) {
    return {
      ok: false,
      reason: "Nomor WhatsApp tidak valid. Gunakan format 08…, 62…, atau +62… (10–14 digit).",
    };
  }
  return { ok: true, normalized, display: formatWhatsappDisplay(normalized) };
}
