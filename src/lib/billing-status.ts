/**
 * Single source of truth for subscription status labels. The Tagihan page and
 * the dashboard Ringkasan must always answer "what is my plan status?" with
 * the same words, so both read this mapping from the same billing snapshot.
 */
export type BillingStatusView = {
  label: string;
  note: string;
  tone: string;
  surface: string;
};

export type BillingStatusInput = {
  status: string;
  plan: { code: string; name: string };
} | null;

export function subscriptionStatusView(billing: BillingStatusInput): BillingStatusView {
  if (!billing) {
    return {
      label: "Belum ada data",
      note: "Akun Anda belum punya paket. Pilih paket di bawah untuk mulai.",
      tone: "bg-[var(--pp-white)] text-[var(--pp-ink)]",
      surface: "border-[var(--pp-line)] bg-[var(--pp-paper)]",
    };
  }
  if (billing.plan.code === "PENDING") {
    return {
      label: "Belum aktif",
      note: "Pilih paket di bawah, transfer, lalu unggah bukti. Setelah disetujui, semua fitur aktif.",
      tone: "bg-[var(--pp-white)] text-[var(--pp-ink)]",
      surface: "border-[var(--pp-ink)] bg-[var(--pp-highlight)]/25",
    };
  }
  if (billing.status === "GRACE_PERIOD") {
    return {
      label: "Masa tenggang",
      note: "Paket sudah lewat jatuh tempo. Segera perpanjang agar pengiriman tidak berhenti.",
      tone: "border-[var(--pp-terracotta)] bg-[var(--pp-terracotta)] text-white",
      surface: "border-[var(--pp-terracotta)] bg-[var(--pp-paper)]",
    };
  }
  if (billing.status === "EXPIRED") {
    return {
      label: "Kedaluwarsa",
      note: "Paket sudah berakhir. Pilih paket untuk mengaktifkan lagi.",
      tone: "border-[var(--pp-danger)] bg-[var(--pp-danger)] text-white",
      surface: "border-[var(--pp-danger)] bg-[var(--pp-paper)]",
    };
  }
  if (billing.status === "SUSPENDED") {
    return {
      label: "Ditangguhkan",
      note: "Hubungi admin untuk informasi lebih lanjut.",
      tone: "bg-[var(--pp-white)] text-[var(--pp-ink)]",
      surface: "border-[var(--pp-ink)] bg-[var(--pp-blush)]/40",
    };
  }
  if (billing.status === "CANCELLED") {
    return {
      label: "Dibatalkan",
      note: "Paket sudah dibatalkan. Pilih paket untuk memulai lagi.",
      tone: "bg-[var(--pp-white)] text-[var(--pp-ink)]",
      surface: "border-[var(--pp-ink)] bg-[var(--pp-blush)]/40",
    };
  }
  return {
    label: "Aktif",
    note: "Paket Anda aktif dan bisa dipakai.",
    tone: "bg-[var(--pp-white)] text-[var(--pp-ink)]",
    surface: "border-[var(--pp-ink)] bg-[var(--pp-mint)]",
  };
}
