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

/**
 * Nama pemegang rekening ditampilkan dengan prefiks "a.n.". Sebagian data lama
 * sudah menyimpan prefiks itu di dalam nilai (mis. "a.n. Yusuf Ali"); kalau UI
 * menambahkannya lagi tanpa cek, tampilannya dobel ("a.n. a.n. Yusuf Ali").
 * Helper ini menormalkan tampilan: prefiks hanya ditambahkan kalau nilainya
 * belum diawali pola "a.n." (termasuk varian "an.", "a.n", "An.").
 */
export function formatAccountHolderDisplay(value: string): string {
  const holder = value.trim();
  if (!holder) return "";
  if (/^a\.?\s*n\.?\s+/i.test(holder)) return holder;
  return `a.n. ${holder}`;
}
