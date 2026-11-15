/**
 * Perkiraan kapasitas VPS: berapa tenant lagi yang muat.
 *
 * CPU, RAM, dan disk memakai ukuran fisik mesin yang memang terukur. Batas
 * sesi WhatsApp dan pesan per bulan TIDAK punya angka bawaan di sistem,
 * jadi keduanya wajib diisi SuperAdmin. Kalau belum diisi, bound itu
 * ditandai "belum bisa dihitung" — tidak pernah ditebak dari pemakaian
 * saat ini, karena itu akan mengarang kapasitas.
 *
 * Batas akhir adalah bound paling sempit yang bisa dihitung; angka
 * "tenant lagi" adalah pembulatan ke bawah dari bound itu.
 *
 * Semua fungsi murni supaya bisa diuji tanpa database/systeminformation.
 */

export type CapacityLimitInput = {
  cpuCores: number | null;
  ramBytes: string | number | null;
  diskBytes: string | number | null;
  waSessions: number | null;
  monthlyMessages: string | number | null;
};

export type CapacityUsageInput = {
  cpuCores: number;
  cpuPercent: number;
  ramTotalBytes: string | number;
  ramUsedBytes: string | number;
  diskTotalBytes: string | number;
  diskUsedBytes: string | number;
  diskUsePercent: number;
  waSessions: number;
  monthlyMessages: string | number;
  tenants: number;
};

export type CapacityBoundKey = "RAM" | "CPU" | "DISK" | "SESSIONS" | "MESSAGES";

export type CapacityBound = {
  key: CapacityBoundKey;
  label: string;
  available: boolean;
  reason: string | null;
  usage: number;
  limit: number;
  /** Rata-rata pemakaian per tenant. 0 berarti belum bisa dihitung. */
  avgPerTenant: number;
  remainingTenants: number | null;
  usePercent: number;
};

export type CapacityReport = {
  tenants: number;
  remainingTenants: number | null;
  statusPercent: number;
  statusLevel: "ok" | "warning" | "critical" | "unknown";
  fullest: CapacityBoundKey | null;
  /** Bagian paling penuh di antara RAM, CPU, dan disk (untuk email peringatan). */
  fullestResource: "RAM" | "CPU" | "Disk" | null;
  /** Bound yang belum bisa dihitung beserta alasannya ada di `bounds`. */
  missingLimits: CapacityBoundKey[];
  bounds: CapacityBound[];
  note: string;
};

const DAYS_PER_MONTH = 30;

function readLimit(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.floor(parsed);
}

/** Baca `SystemConfig.capacityLimits` (JSON) dengan aman; nilai rusak diabaikan. */
export function parseCapacityLimits(value: unknown): Partial<CapacityLimitInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    cpuCores: readLimit(raw.cpuCores, 1024),
    ramBytes: raw.ramBytes === null || raw.ramBytes === undefined || raw.ramBytes === "" ? null : String(readLimit(raw.ramBytes) ?? ""),
    diskBytes: raw.diskBytes === null || raw.diskBytes === undefined || raw.diskBytes === "" ? null : String(readLimit(raw.diskBytes) ?? ""),
    waSessions: readLimit(raw.waSessions, 1_000_000),
    monthlyMessages: raw.monthlyMessages === null || raw.monthlyMessages === undefined || raw.monthlyMessages === "" ? null : String(readLimit(raw.monthlyMessages) ?? ""),
  };
}

function numberOrZero(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Hijau di bawah 70%, kuning 70% sampai 90%, merah di atas 90%.
 * Tepat 90% masih kuning sesuai keputusan pemilik.
 */
export function capacityStatusLevel(percent: number): CapacityReport["statusLevel"] {
  if (!Number.isFinite(percent)) return "unknown";
  if (percent > 90) return "critical";
  if (percent >= 70) return "warning";
  return "ok";
}

/**
 * Batas efektif: nilai yang disimpan admin kalau ada, kalau tidak pakai
 * pengukuran fisik mesin. Sesi WA dan pesan per bulan sengaja dibiarkan
 * null sampai SuperAdmin mengisinya.
 */
export function effectiveCapacityLimits(live: CapacityUsageInput, saved: Partial<CapacityLimitInput>): CapacityLimitInput {
  return {
    cpuCores: saved.cpuCores ?? (live.cpuCores > 0 ? live.cpuCores : null),
    ramBytes: saved.ramBytes ?? (numberOrZero(live.ramTotalBytes) > 0 ? String(live.ramTotalBytes) : null),
    diskBytes: saved.diskBytes ?? (numberOrZero(live.diskTotalBytes) > 0 ? String(live.diskTotalBytes) : null),
    waSessions: saved.waSessions ?? null,
    monthlyMessages: saved.monthlyMessages ?? null,
  };
}

function bound(input: {
  key: CapacityBoundKey;
  label: string;
  usage: number;
  limit: number;
  tenants: number;
  missingHint?: string;
}): CapacityBound {
  const usage = Math.max(0, input.usage);
  const limit = Math.max(0, input.limit);
  const usePercent = limit > 0 ? Math.min(100, usage / limit * 100) : 0;
  if (input.tenants <= 0) {
    return {
      key: input.key, label: input.label, available: false,
      reason: "Belum ada tenant berbayar untuk menghitung rata-rata.",
      usage, limit, avgPerTenant: 0, remainingTenants: null, usePercent,
    };
  }
  if (limit <= 0) {
    return {
      key: input.key, label: input.label, available: false,
      reason: input.missingHint ?? "Batas belum diisi. Isi di Pengaturan kapasitas.",
      usage, limit, avgPerTenant: 0, remainingTenants: null, usePercent,
    };
  }
  const avgPerTenant = usage / input.tenants;
  if (!Number.isFinite(avgPerTenant) || avgPerTenant <= 0) {
    return {
      key: input.key, label: input.label, available: false,
      reason: "Pemakaian saat ini nol, rata-rata per tenant belum bisa dihitung.",
      usage, limit, avgPerTenant: 0, remainingTenants: null, usePercent,
    };
  }
  const remaining = Math.max(0, Math.floor((limit - usage) / avgPerTenant));
  return {
    key: input.key, label: input.label, available: true,
    reason: null, usage, limit, avgPerTenant, remainingTenants: remaining, usePercent,
  };
}

export function evaluateCapacity(live: CapacityUsageInput, saved: Partial<CapacityLimitInput> = {}): CapacityReport {
  const limits = effectiveCapacityLimits(live, saved);
  const tenants = Math.max(0, Math.floor(live.tenants));
  const cpuLimitPercent = (limits.cpuCores ?? 0) * 100;
  const ramLimit = numberOrZero(limits.ramBytes);
  const diskLimit = numberOrZero(limits.diskBytes);

  const bounds = [
    bound({ key: "RAM", label: "RAM", usage: numberOrZero(live.ramUsedBytes), limit: ramLimit, tenants }),
    // CPU: usage berupa persen, limit berupa persen x jumlah core.
    bound({ key: "CPU", label: "CPU", usage: finiteOrZero(live.cpuPercent), limit: cpuLimitPercent, tenants }),
    // Disk memakai partisi paling penuh, karena data PesanPro tumbuh di partisi
    // tempat aplikasi berjalan, bukan di seluruh disk sekaligus.
    bound({ key: "DISK", label: "Disk", usage: numberOrZero(live.diskUsedBytes), limit: diskLimit, tenants }),
    bound({
      key: "SESSIONS", label: "Sesi WhatsApp",
      usage: finiteOrZero(live.waSessions), limit: limits.waSessions ?? 0, tenants,
      missingHint: "Batas maksimal sesi WhatsApp per VPS belum diisi. Isi di Pengaturan kapasitas.",
    }),
    bound({
      key: "MESSAGES", label: "Pesan per bulan",
      usage: numberOrZero(live.monthlyMessages), limit: numberOrZero(limits.monthlyMessages), tenants,
      missingHint: "Batas maksimal pesan per bulan per VPS belum diisi. Isi di Pengaturan kapasitas.",
    }),
  ];

  const available = bounds.filter((item) => item.available && item.remainingTenants !== null);
  const remainingTenants = available.length > 0
    ? Math.min(...available.map((item) => item.remainingTenants ?? 0))
    : null;
  const tightest = available.reduce<CapacityBound | null>((best, item) => {
    if (!best) return item;
    return (item.remainingTenants ?? 0) < (best.remainingTenants ?? 0) ? item : best;
  }, null);

  const ramPercent = numberOrZero(live.ramTotalBytes) > 0
    ? numberOrZero(live.ramUsedBytes) / numberOrZero(live.ramTotalBytes) * 100
    : 0;
  const cpuPercent = finiteOrZero(live.cpuPercent);
  const diskPercent = finiteOrZero(live.diskUsePercent);
  const statusPercent = Math.max(ramPercent, cpuPercent, diskPercent);
  const resourcePercents: Array<{ label: "RAM" | "CPU" | "Disk"; percent: number }> = [
    { label: "RAM", percent: ramPercent },
    { label: "CPU", percent: cpuPercent },
    { label: "Disk", percent: diskPercent },
  ];
  const fullestResource = resourcePercents.reduce(
    (best, item) => (item.percent > best.percent ? item : best),
    resourcePercents[0],
  ).label;

  const missingLimits = bounds.filter((item) => !item.available).map((item) => item.key);
  const noteParts = [
    "Perkiraan memakai rata-rata pemakaian per tenant berbayar saat ini, termasuk beban sistem. Yang paling sempit yang menentukan angka tenant lagi. Angka ini perkiraan, bukan jaminan.",
  ];
  if (missingLimits.length > 0) {
    noteParts.push(`Belum bisa dihitung untuk ${missingLimits.join(", ")}: lihat alasan pada tiap kartu. Isi batas sesi WhatsApp dan pesan per bulan agar perkiraan lengkap.`);
  }
  return {
    tenants,
    remainingTenants,
    statusPercent: Math.round(statusPercent * 10) / 10,
    statusLevel: capacityStatusLevel(statusPercent),
    fullest: tightest?.key ?? null,
    fullestResource,
    missingLimits,
    bounds,
    note: noteParts.join(" "),
  };
}

/** Biaya VPS per hari untuk periode laporan yang lebih pendek dari sebulan. */
export function proratedVpsCost(monthlyCostIdr: string | number, days: number): number {
  return Math.round(numberOrZero(monthlyCostIdr) * Math.max(0, days) / DAYS_PER_MONTH);
}
