import { jakartaDayStart, jakartaMonthStart, parseJakartaDate, toRupiah } from "./promo-pricing";

/**
 * Periode laporan pemasukan mengikuti keputusan pemilik 15 Nov 2026:
 * minggu ini, bulan ini, 30 hari terakhir, semua waktu sejak awal.
 * TODAY / 7D / LAST_MONTH / CUSTOM tetap disediakan sebagai pilihan tambahan.
 */
export type RevenuePreset =
  | "TODAY"
  | "THIS_WEEK"
  | "7D"
  | "LAST_30_DAYS"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "ALL_TIME"
  | "CUSTOM";

export type RevenuePaymentInput = {
  amount: string | number;
  discountAmount?: string | number | null;
  reviewedAt: Date | null;
  createdAt: Date;
  status: string;
  planCode?: string | null;
  planName?: string | null;
};

export type RevenuePeriod = {
  preset: RevenuePreset;
  start: Date;
  /** Eksklusif. */
  end: Date;
  label: string;
};

export type RevenueByPlan = {
  planCode: string;
  planName: string;
  count: number;
  beforeDiscount: number;
  discount: number;
  gross: number;
};

export type RevenueSeriesPoint = {
  key: string;
  label: string;
  amount: number;
};

export type RevenueSummary = {
  period: RevenuePeriod;
  /** Nominal sebelum promo, dari pembayaran yang sudah disetujui. */
  beforeDiscount: number;
  /** Total potongan promo yang benar-benar diberikan. */
  discountTotal: number;
  /** Pemasukan disetujui = sebelum promo - total promo. */
  gross: number;
  /** Semua pembayaran yang masuk pada periode ini, termasuk PENDING. */
  allIncomingTotal: number;
  pendingTotal: number;
  pendingCount: number;
  paymentCount: number;
  average: number;
  infraCost: number;
  /** Pemasukan disetujui dikurangi biaya VPS. */
  net: number;
  byPlan: RevenueByPlan[];
  /** Seri otomatis (harian untuk periode pendek, bulanan untuk periode panjang). */
  series: RevenueSeriesPoint[];
  /** Grafik harian, selalu tersedia. */
  dailySeries: RevenueSeriesPoint[];
  /** Grafik bulanan, selalu tersedia. */
  monthlySeries: RevenueSeriesPoint[];
  note: string;
};

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function endOfJakartaDay(dayStart: Date): Date {
  return new Date(dayStart.getTime() + DAY_MS);
}

/** Senin 00:00 WIB pada minggu berjalan. */
function jakartaWeekStart(now: Date): Date {
  const dayStart = jakartaDayStart(now);
  const weekday = new Date(dayStart.getTime() + WIB_OFFSET_MS).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
}

function lastDayOfJakartaMonth(now: Date): Date {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - WIB_OFFSET_MS);
}

export function resolveRevenuePeriod(input: {
  preset: RevenuePreset;
  now?: Date;
  from?: string | null;
  to?: string | null;
}): RevenuePeriod {
  const now = input.now ?? new Date();
  const today = jakartaDayStart(now);
  const tomorrow = endOfJakartaDay(today);
  if (input.preset === "TODAY") {
    return { preset: "TODAY", start: today, end: tomorrow, label: "Hari ini" };
  }
  if (input.preset === "THIS_WEEK") {
    return { preset: "THIS_WEEK", start: jakartaWeekStart(now), end: tomorrow, label: "Minggu ini" };
  }
  if (input.preset === "7D") {
    return { preset: "7D", start: new Date(today.getTime() - 6 * DAY_MS), end: tomorrow, label: "7 hari terakhir" };
  }
  if (input.preset === "LAST_30_DAYS") {
    return { preset: "LAST_30_DAYS", start: new Date(today.getTime() - 29 * DAY_MS), end: tomorrow, label: "30 hari terakhir" };
  }
  if (input.preset === "ALL_TIME") {
    return { preset: "ALL_TIME", start: new Date(0), end: tomorrow, label: "Semua waktu sejak awal" };
  }
  if (input.preset === "LAST_MONTH") {
    const thisMonth = jakartaMonthStart(now);
    const previousMonthShifted = new Date(thisMonth.getTime() + WIB_OFFSET_MS);
    const start = new Date(Date.UTC(
      previousMonthShifted.getUTCFullYear(),
      previousMonthShifted.getUTCMonth() - 1,
      1,
    ) - WIB_OFFSET_MS);
    return { preset: "LAST_MONTH", start, end: thisMonth, label: "Bulan lalu" };
  }
  if (input.preset === "CUSTOM") {
    const from = input.from ? parseJakartaDate(input.from) : null;
    const to = input.to ? parseJakartaDate(input.to) : null;
    if (from && to && from <= to) {
      return {
        preset: "CUSTOM",
        start: from,
        end: new Date(to.getTime() + DAY_MS),
        label: `${input.from} sampai ${input.to}`,
      };
    }
  }
  const start = jakartaMonthStart(now);
  return { preset: "THIS_MONTH", start, end: lastDayOfJakartaMonth(now), label: "Bulan ini" };
}

function inPeriod(payment: RevenuePaymentInput, period: Pick<RevenuePeriod, "start" | "end">): boolean {
  const at = payment.reviewedAt ?? payment.createdAt;
  return at >= period.start && at < period.end;
}

/** Hanya pembayaran APPROVED yang dihitung sebagai pemasukan. */
export function filterApprovedPayments(
  payments: RevenuePaymentInput[],
  period: Pick<RevenuePeriod, "start" | "end">,
): RevenuePaymentInput[] {
  return payments.filter((payment) => payment.status === "APPROVED" && inPeriod(payment, period));
}

/** PENDING tetap tercatat sebagai "yang masuk", tapi bukan pemasukan disetujui. */
export function filterPendingPayments(
  payments: RevenuePaymentInput[],
  period: Pick<RevenuePeriod, "start" | "end">,
): RevenuePaymentInput[] {
  return payments.filter((payment) => payment.status === "PENDING" && inPeriod(payment, period));
}

function jakartaDateKey(value: Date): string {
  const shifted = new Date(value.getTime() + WIB_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function buildRevenueSeries(
  payments: RevenuePaymentInput[],
  period: RevenuePeriod,
  granularity: "auto" | "daily" | "monthly" = "auto",
): RevenueSeriesPoint[] {
  const spanDays = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / DAY_MS));
  const byMonth = granularity === "monthly" || (granularity === "auto" && spanDays > 62);
  const buckets = new Map<string, RevenueSeriesPoint>();
  for (const payment of filterApprovedPayments(payments, period)) {
    const at = payment.reviewedAt ?? payment.createdAt;
    const key = byMonth ? jakartaDateKey(at).slice(0, 7) : jakartaDateKey(at);
    const label = byMonth
      ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(at)
      : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(at);
    const existing = buckets.get(key);
    if (existing) existing.amount += toRupiah(payment.amount);
    else buckets.set(key, { key, label, amount: toRupiah(payment.amount) });
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function summarizeByPlan(payments: RevenuePaymentInput[]): RevenueByPlan[] {
  const grouped = new Map<string, RevenueByPlan>();
  for (const payment of payments) {
    const code = payment.planCode?.trim() || "LAINNYA";
    const name = payment.planName?.trim() || "Paket tidak dikenal";
    const row = grouped.get(code) ?? { planCode: code, planName: name, count: 0, beforeDiscount: 0, discount: 0, gross: 0 };
    const amount = toRupiah(payment.amount);
    const discount = toRupiah(payment.discountAmount ?? 0);
    row.count += 1;
    row.gross += amount;
    row.discount += discount;
    row.beforeDiscount += amount + discount;
    grouped.set(code, row);
  }
  const order: Record<string, number> = { STARTER: 0, BISNIS: 1, PRO: 2 };
  return [...grouped.values()].sort((a, b) => (order[a.planCode] ?? 99) - (order[b.planCode] ?? 99) || a.planCode.localeCompare(b.planCode));
}

export function summarizeRevenue(input: {
  payments: RevenuePaymentInput[];
  period: RevenuePeriod;
  infraCostIdr: string | number;
}): RevenueSummary {
  const approved = filterApprovedPayments(input.payments, input.period);
  const pending = filterPendingPayments(input.payments, input.period);
  const gross = approved.reduce((sum, item) => sum + toRupiah(item.amount), 0);
  const discountTotal = approved.reduce((sum, item) => sum + toRupiah(item.discountAmount ?? 0), 0);
  const pendingTotal = pending.reduce((sum, item) => sum + toRupiah(item.amount), 0);
  const infraCost = toRupiah(input.infraCostIdr);
  return {
    period: input.period,
    beforeDiscount: gross + discountTotal,
    discountTotal,
    gross,
    allIncomingTotal: gross + pendingTotal,
    pendingTotal,
    pendingCount: pending.length,
    paymentCount: approved.length,
    average: approved.length > 0 ? Math.round(gross / approved.length) : 0,
    infraCost,
    net: gross - infraCost,
    byPlan: summarizeByPlan(approved),
    series: buildRevenueSeries(input.payments, input.period),
    dailySeries: buildRevenueSeries(input.payments, input.period, "daily"),
    monthlySeries: buildRevenueSeries(input.payments, input.period, "monthly"),
    note: "Rumus: pemasukan sebelum promo − total promo = pemasukan disetujui; pemasukan disetujui − biaya VPS bulanan penuh = pemasukan bersih. Pembayaran PENDING tidak dihitung sebagai pemasukan disetujui. Belum termasuk pajak dan biaya lain.",
  };
}
