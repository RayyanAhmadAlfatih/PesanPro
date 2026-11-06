// Daftar bank tujuan transfer yang umum di Indonesia (F1.3).
//
// Superadmin memilih dari daftar ini, bukan teks bebas, supaya nama bank di
// daftar rekening selalu konsisten untuk dicocokkan admin. Kalau pemilik
// butuh bank lain, tambahkan di sini — satu sumber untuk validasi API dan
// pilihan UI.
export const BANK_OPTIONS = [
  "BCA",
  "Mandiri",
  "BRI",
  "BNI",
  "Permata",
  "CIMB Niaga",
  "Danamon",
  "BTN",
  "Bank Syariah Indonesia (BSI)",
  "OCBC NISP",
  "Panin",
  "UOB",
] as const;

export type BankOption = (typeof BANK_OPTIONS)[number];

export function isKnownBank(value: string): value is BankOption {
  return (BANK_OPTIONS as readonly string[]).includes(value);
}

/**
 * Nomor rekening disimpan rapat (angka saja, tanpa spasi/dash) dan ditampilkan
 * berkelompok 4 digit supaya mudah dibaca dan disalin ulang.
 */
export function formatAccountNumberDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}
