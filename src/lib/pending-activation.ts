/**
 * Gerbang "tunggu persetujuan" untuk akun baru yang bukti pembayarannya
 * masih diperiksa admin.
 *
 * Aturannya (keputusan pemilik, 6 Nov 2026): tenant dengan paket PENDING yang
 * sudah mengirim bukti tidak boleh dibawa ke dashboard kerja; mereka harus
 * berhenti di halaman tunggu sampai admin memutuskan. Tenant yang sudah aktif
 * tapi menunggu perpanjangan tetap melihat dashboard normal, dan akun tanpa
 * kiriman bukti sama sekali tetap diarahkan ke Tagihan.
 */

/** True hanya kalau akun memang masih memakai paket PENDING DAN ada bukti yang belum diputuskan. */
export function shouldShowActivationWait(
  planCode: string | null | undefined,
  hasPendingVerification: boolean,
): boolean {
  return planCode === "PENDING" && hasPendingVerification;
}

/** Label siklus langganan seperti yang dipakai di layar pendaftaran. */
export function activationCycleLabel(cycle: string): string {
  return cycle === "YEARLY" ? "12 bulan" : "1 bulan";
}

/** Format nominal IDR; mengikuti gaya tampilan di layar sukses pendaftaran. */
export function formatActivationAmount(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return "Belum tersedia";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
