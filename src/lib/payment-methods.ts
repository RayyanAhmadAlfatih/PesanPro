import { prisma } from "./prisma";

// Saklar utama cara bayar (keputusan pemilik 5 Nov 2026).
//
// Superadmin bisa mengaktifkan Transfer Bank Manual, Midtrans, atau keduanya.
// "Siap" dihitung PER CARA BAYAR, bukan gabungan:
//   - Manual siap  = saklar Manual AKTIF  DAN minimal 1 rekening aktif.
//   - Midtrans siap = saklar Midtrans AKTIF DAN kunci terpasang DAN minimal
//     1 metode aktif (Fase 2). Sampai integrasinya ada, Midtrans tidak pernah
//     siap sehingga opsinya tidak pernah tampil ke user.
// Cara bayar yang tidak siap tidak boleh tampil ke user; superadmin melihat
// peringatan persis apa yang kurang (kolom `missing`).

export type PaymentMethodKey = "MANUAL" | "MIDTRANS";

export type PaymentMethodStatus = {
  key: PaymentMethodKey;
  label: string;
  /** Saklar superadmin AKTIF/NONAKTIF. */
  enabled: boolean;
  /** enabled DAN semua syaratnya terpenuhi — hanya ini yang boleh tampil ke user. */
  ready: boolean;
  /** Peringatan superadmin: daftar persis apa yang kurang. Kosong kalau siap. */
  missing: string[];
};

export type PaymentMethodsSnapshot = {
  manual: PaymentMethodStatus;
  midtrans: PaymentMethodStatus;
  /** Ada minimal satu cara bayar yang siap dipakai user. */
  anyReady: boolean;
  activeManualAccountCount: number;
};

export type PaymentMethodsInput = {
  manualEnabled: boolean;
  midtransEnabled: boolean;
  activeManualAccountCount: number;
  /** Kunci Midtrans terpasang (env). Fase 1 selalu false. */
  midtransKeysConfigured: boolean;
  /** Metode Midtrans aktif (QRIS/e-wallet/VA/…). Fase 1 selalu 0. */
  activeMidtransMethodCount: number;
};

export function evaluatePaymentMethods(input: PaymentMethodsInput): PaymentMethodsSnapshot {
  const manualMissing: string[] = [];
  if (!input.manualEnabled) {
    manualMissing.push("Saklar Transfer Bank Manual dalam keadaan NONAKTIF.");
  }
  if (input.manualEnabled && input.activeManualAccountCount === 0) {
    manualMissing.push("Saklar Manual AKTIF, tetapi belum ada satu pun rekening aktif. Tambahkan rekening di Settings Pembayaran.");
  }

  const midtransMissing: string[] = [];
  if (!input.midtransEnabled) {
    midtransMissing.push("Saklar Midtrans dalam keadaan NONAKTIF.");
  }
  if (input.midtransEnabled) {
    if (!input.midtransKeysConfigured) {
      midtransMissing.push("Kunci Midtrans belum terpasang (MIDTRANS_SERVER_KEY/MIDTRANS_CLIENT_KEY lewat environment variable).");
    }
    if (input.activeMidtransMethodCount === 0) {
      midtransMissing.push("Belum ada metode Midtrans yang diaktifkan.");
    }
    midtransMissing.push("Integrasi Midtrans dikerjakan di Fase 2 (PR 2) — sampai itu, opsi Midtrans tidak tampil ke user.");
  }

  const manual: PaymentMethodStatus = {
    key: "MANUAL",
    label: "Transfer Bank Manual",
    enabled: input.manualEnabled,
    ready: input.manualEnabled && input.activeManualAccountCount > 0,
    missing: manualMissing,
  };
  const midtrans: PaymentMethodStatus = {
    key: "MIDTRANS",
    label: "Midtrans (Snap)",
    enabled: input.midtransEnabled,
    ready:
      input.midtransEnabled
      && input.midtransKeysConfigured
      && input.activeMidtransMethodCount > 0,
    missing: midtransMissing,
  };

  return {
    manual,
    midtrans,
    anyReady: manual.ready || midtrans.ready,
    activeManualAccountCount: input.activeManualAccountCount,
  };
}

/**
 * Baca keadaan saklar + rekening dari database dan hitung kesiapannya.
 * Fase 1: kunci Midtrans belum dibaca dari env (Fase 2 yang memasangnya),
 * jadi `midtransKeysConfigured` selalu false di sini.
 */
export async function getPaymentMethodsSnapshot(): Promise<PaymentMethodsSnapshot> {
  const [config, activeManualAccountCount] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { id: "default" },
      select: { manualTransferEnabled: true, midtransEnabled: true },
    }),
    prisma.paymentAccount.count({ where: { isActive: true } }),
  ]);

  return evaluatePaymentMethods({
    manualEnabled: config?.manualTransferEnabled ?? true,
    midtransEnabled: config?.midtransEnabled ?? false,
    activeManualAccountCount,
    midtransKeysConfigured: false,
    activeMidtransMethodCount: 0,
  });
}

/**
 * Versi publik untuk payload onboarding/checkout: cukup `enabled` dan `ready`.
 * Daftar `missing` hanya untuk superadmin, jangan bocor ke publik.
 */
export function serializePaymentMethodsForPublic(snapshot: PaymentMethodsSnapshot) {
  return {
    manual: { enabled: snapshot.manual.enabled, ready: snapshot.manual.ready, label: snapshot.manual.label },
    midtrans: { enabled: snapshot.midtrans.enabled, ready: snapshot.midtrans.ready, label: snapshot.midtrans.label },
    anyReady: snapshot.anyReady,
  };
}
