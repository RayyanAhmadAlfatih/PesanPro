/** Tipe bersama untuk semua sub-halaman SuperAdmin. */

export type Preset = "TODAY" | "THIS_WEEK" | "7D" | "LAST_30_DAYS" | "THIS_MONTH" | "LAST_MONTH" | "ALL_TIME" | "CUSTOM";
export type RevenueView = "APPROVED" | "ALL" | "NET";

export interface RevenueByPlan {
  planCode: string;
  planName: string;
  count: number;
  beforeDiscount: number;
  discount: number;
  gross: number;
}

export interface RevenueSummary {
  period: { preset: Preset; start: string; end: string; label: string };
  beforeDiscount: number;
  gross: number;
  discountTotal: number;
  allIncomingTotal: number;
  pendingTotal: number;
  pendingCount: number;
  paymentCount: number;
  average: number;
  infraCost: number;
  net: number;
  byPlan: RevenueByPlan[];
  series: Array<{ key: string; label: string; amount: number }>;
  dailySeries: Array<{ key: string; label: string; amount: number }>;
  monthlySeries: Array<{ key: string; label: string; amount: number }>;
  note: string;
}

export interface CapacityBound {
  key: string;
  label: string;
  available: boolean;
  reason: string | null;
  usage: number;
  limit: number;
  avgPerTenant: number;
  remainingTenants: number | null;
  usePercent: number;
}

export interface Promo {
  id: string;
  name: string;
  description: string | null;
  kind: "PERCENT" | "FIXED" | "VOUCHER";
  percent: string | null;
  code: string | null;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  billingScope: "MONTHLY" | "YEARLY" | "BOTH";
  plans: Array<{ planId: string; fixedPrice: string | null }>;
  usage: { reserved: number; approved: number; released: number; active: number };
  createdAt: string;
  createdBy?: { name: string | null; email: string } | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  priceMonthly: string | null;
  priceYearly: string | null;
  currency: string;
  priceHistory: Array<{
    id: string; field: "MONTHLY" | "YEARLY"; oldPrice: string | null; newPrice: string | null;
    changedAt: string; changedBy: { name: string | null; email: string };
  }>;
}

export interface Payment {
  id: string;
  amount: string;
  baseAmount: string | null;
  discountAmount: string;
  billingCycle: string;
  currency: string;
  reference: string | null;
  proofUrl: string | null;
  voucherCode: string | null;
  createdAt: string;
  user: { name: string | null; email: string; whatsappNumber: string | null };
  plan: { name: string; code: string } | null;
  bankAccount: { bankName: string; accountNumber: string; accountHolder: string } | null;
}

export interface Overview {
  generatedAt: string;
  revenue: RevenueSummary;
  capacity: {
    report: {
      tenants: number;
      remainingTenants: number | null;
      statusPercent: number;
      statusLevel: "ok" | "warning" | "critical" | "unknown";
      fullest: string | null;
      fullestResource: "RAM" | "CPU" | "Disk" | null;
      missingLimits: string[];
      bounds: CapacityBound[];
      note: string;
    };
    limits: { cpuCores: number | null; ramBytes: string | null; diskBytes: string | null; waSessions: number | null; monthlyMessages: string | null };
    source: "saved" | "live";
    live: {
      cpuCores: number; cpuPercent: number; ramTotalBytes: string; ramUsedBytes: string;
      diskTotalBytes: string; diskUsedBytes: string; diskUsePercent: number;
      waSessions: number; monthlyMessages: string; tenants: number;
    };
    vpsMonthlyCostIdr: string;
  };
  vps: {
    database: { ok: boolean; latencyMs: number; errorCode?: string };
    storage: { ok: boolean; latencyMs: number; path?: string; freeBytes?: string; totalBytes?: string; errorCode?: string };
    processes: Array<{ processType: string; ok: boolean }>;
    queues: Array<{ name: string; pending: number; processing: number; failed: number }>;
    resources: {
      cpuPercent: number;
      memory: { totalBytes: string; usedBytes: string; usePercent: number };
      disks: Array<{ mount: string; usePercent: number; usedBytes: string; sizeBytes: string }>;
    };
    alerts: Array<{ id: string; severity: string; title: string; message: string }>;
    uptimeSeconds: number;
  };
  promos: Promo[];
  plans: Plan[];
  pendingPayments: Payment[];
  business: {
    tenants: number; activeUsers: number; sentMessages: number;
    devices: { total: number; connected: number };
    storageBytes: string;
  };
  settings: { vpsMonthlyCostIdr: string; timezone: string };
}
