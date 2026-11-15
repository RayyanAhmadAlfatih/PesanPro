import { z } from "zod";

const price = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Harga harus angka").max(20);

const planSchema = z.object({
  planId: z.string().trim().min(1),
  fixedPrice: price.nullable().optional(),
}).strict();

const baseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  kind: z.enum(["PERCENT", "FIXED", "VOUCHER"]),
  percent: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Persen harus angka").nullable().optional(),
  code: z.string().trim().max(64).nullable().optional(),
  enabled: z.boolean().default(true),
  startsAt: z.string().trim().min(1).nullable().optional(),
  endsAt: z.string().trim().min(1).nullable().optional(),
  usageLimitTotal: z.number().int().min(1).max(1_000_000).nullable().optional(),
  usageLimitPerUser: z.number().int().min(1).max(1_000_000).nullable().optional(),
  billingScope: z.enum(["MONTHLY", "YEARLY", "BOTH"]).default("BOTH"),
  plans: z.array(planSchema).min(1).max(50),
}).strict();

export type PromoInput = {
  name: string;
  description: string | null;
  kind: "PERCENT" | "FIXED" | "VOUCHER";
  percent: string | null;
  code: string | null;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  billingScope: "MONTHLY" | "YEARLY" | "BOTH";
  plans: Array<{ planId: string; fixedPrice: string | null }>;
};

function parseDate(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} tidak valid`);
  return date;
}

function percentValue(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) throw new Error("Persen harus lebih dari 0 dan maksimal 100");
  return parsed;
}

/**
 * Validasi satu bentuk promo aktif. Mengembalikan input yang sudah dinormalkan
 * atau daftar pesan error yang bisa langsung ditampilkan di form admin.
 */
export function normalizePromoInput(value: unknown): { ok: true; data: PromoInput } | { ok: false; errors: string[] } {
  const parsed = baseSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.values(parsed.error.flatten().fieldErrors).flat().filter(Boolean) as string[],
    };
  }
  const input = parsed.data;
  const errors: string[] = [];
  const planIds = input.plans.map((item) => item.planId);
  if (new Set(planIds).size !== planIds.length) errors.push("Paket promo tidak boleh dobel.");

  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  try {
    startsAt = parseDate(input.startsAt, "Tanggal mulai");
    endsAt = parseDate(input.endsAt, "Tanggal selesai");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Tanggal tidak valid");
  }
  if (startsAt && endsAt && endsAt <= startsAt) errors.push("Tanggal selesai harus setelah tanggal mulai.");

  let percent: number | null = null;
  try {
    percent = percentValue(input.percent);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Persen tidak valid");
  }

  const hasFixed = input.plans.some((item) => item.fixedPrice !== null && item.fixedPrice !== undefined);
  const allFixed = input.plans.every((item) => item.fixedPrice !== null && item.fixedPrice !== undefined);
  if (input.kind === "PERCENT") {
    if (percent === null) errors.push("Promo persen wajib mengisi persen.");
    if (hasFixed) errors.push("Promo persen tidak boleh mengisi harga tetap.");
  }
  if (input.kind === "FIXED") {
    if (percent !== null) errors.push("Promo harga tetap tidak boleh mengisi persen.");
    if (!allFixed) errors.push("Promo harga tetap wajib mengisi harga akhir untuk setiap paket.");
  }
  if (input.kind === "VOUCHER") {
    const code = input.code?.trim().toUpperCase() ?? "";
    if (!/^[A-Z0-9_-]{3,64}$/.test(code)) errors.push("Kode voucher 3-64 karakter: huruf, angka, minus, atau garis bawah.");
    if (percent === null && !allFixed) errors.push("Voucher wajib punya potongan persen atau harga akhir untuk setiap paket.");
    if (percent !== null && hasFixed) errors.push("Voucher persen tidak boleh mengisi harga tetap.");
  }
  for (const item of input.plans) {
    if (item.fixedPrice && Number(item.fixedPrice) <= 0) errors.push("Harga akhir promo harus lebih dari 0.");
  }

  if (errors.length > 0) return { ok: false, errors };
  const normalizedCode = input.kind === "VOUCHER"
    ? (input.code ?? "").trim().toUpperCase()
    : null;
  return {
    ok: true,
    data: {
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      percent: percent === null ? null : String(percent),
      code: normalizedCode,
      enabled: input.enabled,
      startsAt,
      endsAt,
      usageLimitTotal: input.usageLimitTotal ?? null,
      usageLimitPerUser: input.usageLimitPerUser ?? null,
      billingScope: input.billingScope,
      plans: input.plans.map((item) => ({
        planId: item.planId,
        fixedPrice: item.fixedPrice ?? null,
      })),
    },
  };
}
