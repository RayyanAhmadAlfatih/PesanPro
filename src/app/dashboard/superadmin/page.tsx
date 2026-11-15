"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  Megaphone,
  MemoryStick,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/promo-pricing";
import { cn } from "@/lib/utils";

type Preset = "TODAY" | "THIS_WEEK" | "7D" | "LAST_30_DAYS" | "THIS_MONTH" | "LAST_MONTH" | "ALL_TIME" | "CUSTOM";
type RevenueView = "APPROVED" | "ALL" | "NET";

interface RevenueByPlan {
  planCode: string;
  planName: string;
  count: number;
  beforeDiscount: number;
  discount: number;
  gross: number;
}

interface RevenueSummary {
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

interface CapacityBound {
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

interface Overview {
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

interface Promo {
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

interface Plan {
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

interface Payment {
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

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "THIS_WEEK", label: "Minggu ini" },
  { value: "THIS_MONTH", label: "Bulan ini" },
  { value: "LAST_30_DAYS", label: "30 hari terakhir" },
  { value: "ALL_TIME", label: "Semua waktu sejak awal" },
  { value: "TODAY", label: "Hari ini" },
  { value: "7D", label: "7 hari terakhir" },
  { value: "LAST_MONTH", label: "Bulan lalu" },
  { value: "CUSTOM", label: "Pilih tanggal" },
];

const REVENUE_VIEWS: Array<{ value: RevenueView; label: string }> = [
  { value: "APPROVED", label: "Hanya yang sudah disetujui" },
  { value: "ALL", label: "Semua yang masuk (termasuk PENDING)" },
  { value: "NET", label: "Disetujui dikurangi biaya VPS" },
];

function SeriesChart({ points, max }: { points: Array<{ key: string; label: string; amount: number }>; max: number }) {
  if (points.length === 0) {
    return <p className="rounded-lg border border-dashed border-[var(--pp-line)] p-4 text-center text-sm text-[var(--pp-muted)]">Belum ada pembayaran disetujui pada periode ini.</p>;
  }
  return (
    <div className="flex h-36 items-end gap-2 overflow-x-auto pb-2">
      {points.map((point) => (
        <div key={point.key} className="flex min-w-12 flex-1 flex-col items-center gap-1" title={`${point.label}: ${formatRupiah(point.amount)}`}>
          <div className="flex h-28 w-full items-end">
            <div className="w-full rounded-t bg-[var(--pp-ink)]" style={{ height: `${Math.max(4, (point.amount / max) * 100)}%` }} />
          </div>
          <span className="text-[10px] text-[var(--pp-muted)]">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatBytes(value: string | number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatGb(value: string | number | null | undefined) {
  return (Number(value ?? 0) / 1024 ** 3).toFixed(1);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function statusTone(level: string) {
  if (level === "critical") return "border-red-300 bg-red-50 text-red-700";
  if (level === "warning") return "border-amber-300 bg-amber-50 text-amber-800";
  if (level === "ok") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  return "border-[var(--pp-line)] bg-[var(--pp-paper)] text-[var(--pp-muted)]";
}

export default function SuperadminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<Preset>("THIS_MONTH");
  const [viewMode, setViewMode] = useState<RevenueView>("APPROVED");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vpsCost, setVpsCost] = useState("");
  const [capacityForm, setCapacityForm] = useState({ cpuCores: "", ramGb: "", diskGb: "", waSessions: "", monthlyMessages: "" });
  const [planPrices, setPlanPrices] = useState<Record<string, { monthly: string; yearly: string }>>({});
  const [promoEditor, setPromoEditor] = useState<{ open: boolean; promo: Promo | null }>({ open: false, promo: null });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async (nextPreset: Preset = preset, nextFrom = from, nextTo = to) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ preset: nextPreset });
      if (nextPreset === "CUSTOM" && nextFrom) params.set("from", nextFrom);
      if (nextPreset === "CUSTOM" && nextTo) params.set("to", nextTo);
      const response = await fetch(`/api/admin/operations/overview?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Data SuperAdmin tidak bisa dimuat.");
      const overview = body.data as Overview;
      setData(overview);
      setVpsCost(overview.capacity.vpsMonthlyCostIdr);
      setCapacityForm({
        cpuCores: String(overview.capacity.limits.cpuCores ?? ""),
        ramGb: overview.capacity.limits.ramBytes ? formatGb(overview.capacity.limits.ramBytes) : "",
        diskGb: overview.capacity.limits.diskBytes ? formatGb(overview.capacity.limits.diskBytes) : "",
        waSessions: String(overview.capacity.limits.waSessions ?? ""),
        monthlyMessages: overview.capacity.limits.monthlyMessages ?? "",
      });
      setPlanPrices(Object.fromEntries(overview.plans.map((plan) => [
        plan.id,
        { monthly: plan.priceMonthly ?? "", yearly: plan.priceYearly ?? "" },
      ])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Data SuperAdmin tidak bisa dimuat.");
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load("THIS_MONTH", "", ""), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (value: Preset) => {
    setPreset(value);
    if (value !== "CUSTOM") void load(value, from, to);
  };

  const saveSettings = async () => {
    const ramGb = Number(capacityForm.ramGb);
    const diskGb = Number(capacityForm.diskGb);
    if (!vpsCost.trim() || !/^\d+(\.\d{1,2})?$/.test(vpsCost.trim())) return toast.error("Biaya VPS harus angka.");
    if (!Number.isInteger(Number(capacityForm.cpuCores)) || Number(capacityForm.cpuCores) <= 0) return toast.error("Core CPU harus angka bulat lebih dari 0.");
    if (!Number.isFinite(ramGb) || ramGb <= 0) return toast.error("RAM GB harus angka lebih dari 0.");
    if (!Number.isFinite(diskGb) || diskGb <= 0) return toast.error("Disk GB harus angka lebih dari 0.");
    // Batas sesi WA dan pesan tidak punya angka bawaan. Kosong = belum diisi,
    // dan kapasitas untuk bound itu ditampilkan sebagai "belum bisa dihitung".
    const waSessions = capacityForm.waSessions.trim() === "" ? null : Number(capacityForm.waSessions);
    if (waSessions !== null && (!Number.isInteger(waSessions) || waSessions <= 0)) return toast.error("Batas sesi WhatsApp harus angka bulat lebih dari 0, atau dikosongkan.");
    const monthlyMessages = capacityForm.monthlyMessages.trim() === "" ? null : capacityForm.monthlyMessages.trim();
    if (monthlyMessages !== null && !/^\d+$/.test(monthlyMessages)) return toast.error("Batas pesan bulanan harus angka bulat, atau dikosongkan.");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/superadmin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vpsMonthlyCostIdr: vpsCost.trim(),
          capacityLimits: {
            cpuCores: Number(capacityForm.cpuCores),
            ramBytes: String(Math.round(ramGb * 1024 ** 3)),
            diskBytes: String(Math.round(diskGb * 1024 ** 3)),
            waSessions,
            monthlyMessages,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Pengaturan gagal disimpan.");
      toast.success("Biaya VPS dan batas kapasitas tersimpan.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengaturan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const savePlanPrice = async (plan: Plan) => {
    const form = planPrices[plan.id];
    if (!form) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceMonthly: form.monthly.trim() || null,
          priceYearly: form.yearly.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Harga paket gagal disimpan.");
      toast.success(`Harga ${plan.name} diperbarui dan masuk riwayat.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Harga paket gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const reviewPayment = async (id: string, status: "APPROVED" | "REJECTED") => {
    const note = reviewNotes[id]?.trim() ?? "";
    if (note.length < 3) return toast.error("Tulis catatan pemeriksaan minimal 3 karakter.");
    setReviewingId(id);
    try {
      const response = await fetch(`/api/admin/payment-verifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: note }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Pembayaran gagal diperiksa.");
      toast.success(status === "APPROVED" ? "Pembayaran disetujui, paket aktif." : "Pembayaran ditolak.");
      setReviewNotes((current) => ({ ...current, [id]: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pembayaran gagal diperiksa.");
    } finally {
      setReviewingId(null);
    }
  };

  /** Nyala/mati manual: tetap bisa dipakai walau rentang tanggalnya masih jalan. */
  const togglePromo = async (promo: Promo) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/promos/${promo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: promo.name,
          description: promo.description,
          kind: promo.kind,
          percent: promo.percent,
          code: promo.code,
          enabled: !promo.enabled,
          startsAt: promo.startsAt,
          endsAt: promo.endsAt,
          usageLimitTotal: promo.usageLimitTotal,
          usageLimitPerUser: promo.usageLimitPerUser,
          billingScope: promo.billingScope,
          plans: promo.plans.map((item) => ({ planId: item.planId, fixedPrice: item.fixedPrice })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Promo gagal diubah.");
      toast.success(promo.enabled ? "Promo dimatikan." : "Promo dinyalakan.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Promo gagal diubah.");
    } finally {
      setBusy(false);
    }
  };

  const deletePromo = async (promo: Promo) => {
    if (!window.confirm(`Hapus promo "${promo.name}"? Promo yang sudah dipakai tidak bisa dihapus.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/promos/${promo.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Promo gagal dihapus.");
      toast.success("Promo dihapus.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Promo gagal dihapus.");
    } finally {
      setBusy(false);
    }
  };

  const maxDaily = useMemo(() => Math.max(1, ...(data?.revenue.dailySeries.map((item) => item.amount) ?? [0])), [data]);
  const maxMonthly = useMemo(() => Math.max(1, ...(data?.revenue.monthlySeries.map((item) => item.amount) ?? [0])), [data]);
  const headline = data
    ? viewMode === "APPROVED"
      ? { label: "Pemasukan disetujui", value: data.revenue.gross, note: `${data.revenue.paymentCount} pembayaran · ${data.revenue.period.label}` }
      : viewMode === "ALL"
        ? { label: "Semua yang masuk", value: data.revenue.allIncomingTotal, note: `Termasuk ${data.revenue.pendingCount} PENDING · ${data.revenue.period.label}` }
        : { label: "Pemasukan bersih", value: data.revenue.net, note: `Disetujui dikurangi biaya VPS ${formatRupiah(data.revenue.infraCost)}` }
    : null;

  if (loading && !data) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Memuat SuperAdmin" /></div>;
  }
  if (!data) {
    return (
      <div className="p-8">
        <p className="font-semibold">Data SuperAdmin tidak bisa dimuat.</p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Coba lagi</Button>
      </div>
    );
  }

  const capacity = data.capacity.report;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
          <h1 className="text-3xl font-bold tracking-tight">Satu layar operasional</h1>
          <p className="text-sm text-[var(--pp-muted)]">Pemasukan, kesehatan VPS, kapasitas, promo, harga, dan verifikasi pembayaran.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Periode laporan"
            className="h-10 rounded-md border border-[var(--pp-line)] bg-[var(--pp-white)] px-3 text-sm"
            value={preset}
            onChange={(event) => applyPreset(event.target.value as Preset)}
          >
            {PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select
            aria-label="Dasar hitung pemasukan"
            className="h-10 rounded-md border border-[var(--pp-line)] bg-[var(--pp-white)] px-3 text-sm"
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as RevenueView)}
          >
            {REVENUE_VIEWS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {preset === "CUSTOM" ? (
            <>
              <Input type="date" className="h-10 w-auto" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Dari tanggal" />
              <Input type="date" className="h-10 w-auto" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Sampai tanggal" />
              <Button variant="outline" onClick={() => void load("CUSTOM", from, to)}>Terapkan</Button>
            </>
          ) : null}
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Muat ulang
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={headline?.label ?? "Pemasukan"} value={formatRupiah(headline?.value ?? 0)} note={headline?.note ?? ""} icon={<Wallet className="h-5 w-5" />} />
        <MetricCard label="Sebelum promo" value={formatRupiah(data.revenue.beforeDiscount)} note={`Total promo diberikan ${formatRupiah(data.revenue.discountTotal)}`} icon={<BadgeDollarSign className="h-5 w-5" />} />
        <MetricCard label="Pemasukan bersih" value={formatRupiah(data.revenue.net)} note={`Biaya VPS ${formatRupiah(data.revenue.infraCost)} · ${data.revenue.paymentCount} disetujui`} icon={<Server className="h-5 w-5" />} />
        <MetricCard label="Tenant berbayar" value={String(capacity.tenants)} note={`${data.business.devices.connected}/${data.business.devices.total} sesi WA terhubung`} icon={<Users className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Pemasukan</CardTitle>
            <CardDescription>{data.revenue.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3 text-sm">
              <p className="font-semibold">Rumus yang tampil</p>
              <p className="mt-1 text-[var(--pp-muted)]">
                {formatRupiah(data.revenue.beforeDiscount)} − {formatRupiah(data.revenue.discountTotal)} promo = {formatRupiah(data.revenue.gross)} disetujui; {formatRupiah(data.revenue.gross)} − {formatRupiah(data.revenue.infraCost)} VPS = {formatRupiah(data.revenue.net)} bersih.
              </p>
              <p className="mt-1 text-xs text-[var(--pp-muted)]">
                Semua yang masuk (termasuk {data.revenue.pendingCount} PENDING senilai {formatRupiah(data.revenue.pendingTotal)}): {formatRupiah(data.revenue.allIncomingTotal)}. PENDING tidak dihitung sebagai pemasukan disetujui.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <MiniStat label="Sebelum promo" value={formatRupiah(data.revenue.beforeDiscount)} />
              <MiniStat label="Total promo" value={formatRupiah(data.revenue.discountTotal)} />
              <MiniStat label="Disetujui" value={formatRupiah(data.revenue.gross)} />
              <MiniStat label="Bersih" value={formatRupiah(data.revenue.net)} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">Grafik pemasukan harian</p>
              <SeriesChart points={data.revenue.dailySeries} max={maxDaily} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">Grafik pemasukan bulanan</p>
              <SeriesChart points={data.revenue.monthlySeries} max={maxMonthly} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">Dipisah per paket</p>
              {data.revenue.byPlan.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--pp-line)] p-4 text-center text-sm text-[var(--pp-muted)]">Belum ada pembayaran disetujui pada periode ini.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--pp-line)]">
                  <table className="w-full text-sm">
                    <thead><tr><th>Paket</th><th>Jumlah</th><th>Sebelum promo</th><th>Promo</th><th>Disetujui</th></tr></thead>
                    <tbody>
                      {data.revenue.byPlan.map((row) => (
                        <tr key={row.planCode}>
                          <td className="font-semibold">{row.planName}</td>
                          <td className="tabular-nums">{row.count}</td>
                          <td className="tabular-nums">{formatRupiah(row.beforeDiscount)}</td>
                          <td className="tabular-nums">{formatRupiah(row.discount)}</td>
                          <td className="font-semibold tabular-nums">{formatRupiah(row.gross)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Kesehatan VPS</CardTitle>
            <CardDescription>Uptime proses {Math.floor(data.vps.uptimeSeconds / 3600)} jam · DB {data.vps.database.ok ? `${data.vps.database.latencyMs} ms` : "tidak tersedia"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthRow icon={<Cpu className="h-4 w-4" />} label="CPU" value={`${data.vps.resources.cpuPercent.toFixed(1)}%`} percent={data.vps.resources.cpuPercent} />
            <HealthRow icon={<MemoryStick className="h-4 w-4" />} label="RAM" value={`${formatBytes(data.vps.resources.memory.usedBytes)} / ${formatBytes(data.vps.resources.memory.totalBytes)}`} percent={data.vps.resources.memory.usePercent} />
            <HealthRow icon={<HardDrive className="h-4 w-4" />} label="Disk" value={`${formatBytes(data.vps.resources.disks[0]?.usedBytes)} / ${formatBytes(data.vps.resources.disks[0]?.sizeBytes)}`} percent={data.vps.resources.disks[0]?.usePercent ?? 0} />
            <HealthRow icon={<Database className="h-4 w-4" />} label="Database" value={data.vps.database.ok ? "Terhubung" : "Gagal"} percent={data.vps.database.ok ? 100 : 0} tone={data.vps.database.ok ? "ok" : "critical"} />
            <HealthRow icon={<HardDrive className="h-4 w-4" />} label="Penyimpanan" value={data.vps.storage.ok ? `Aktif · ${formatBytes(data.vps.storage.freeBytes)} bebas` : "Gagal"} percent={data.vps.storage.ok ? 100 : 0} tone={data.vps.storage.ok ? "ok" : "critical"} />
            <p className="text-xs text-[var(--pp-muted)]">
              Sesi WhatsApp {data.business.devices.connected}/{data.business.devices.total} terhubung · {data.vps.queues.reduce((total, queue) => total + queue.pending, 0)} pesan menunggu di antrean.
            </p>
            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              {data.vps.processes.map((process) => (
                <div key={process.processType} className="flex items-center justify-between rounded-md border border-[var(--pp-line)] px-3 py-2 text-xs">
                  <span>{process.processType}</span>
                  <Badge variant={process.ok ? "outline" : "secondary"}>{process.ok ? "OK" : "STALE"}</Badge>
                </div>
              ))}
            </div>
            {data.vps.alerts.length > 0 ? (
              <div className="space-y-2">
                {data.vps.alerts.slice(0, 4).map((alert) => (
                  <div key={alert.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{alert.title}</p>
                    <p className="mt-1">{alert.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className={cn("border", statusTone(capacity.statusLevel))}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Kapasitas tersisa</CardTitle>
              <CardDescription>Perkiraan dari bound paling sempit. Batas bisa diubah di bawah.</CardDescription>
            </div>
            <Badge variant="outline">
              {capacity.remainingTenants === null
                ? "Kapasitas belum bisa dihitung"
                : `Kira-kira masih muat ${capacity.remainingTenants} tenant lagi`} · {capacity.statusPercent}% terpakai
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {capacity.bounds.map((bound) => (
              <div key={bound.key} className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-white)] p-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{bound.label}</span>
                  <span>{bound.usePercent.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pp-paper)]">
                  <div className={cn("h-full", bound.usePercent > 90 ? "bg-red-500" : bound.usePercent >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, bound.usePercent)}%` }} />
                </div>
                <p className="mt-2 text-xs text-[var(--pp-muted)]">
                  {bound.key === "RAM" || bound.key === "DISK"
                    ? `${formatBytes(bound.usage)} / ${formatBytes(bound.limit)}`
                    : `${Math.round(bound.usage).toLocaleString("id-ID")} / ${Math.round(bound.limit).toLocaleString("id-ID")}`}
                </p>
                <p className="mt-1 font-medium">{bound.available ? `Kira-kira ${bound.remainingTenants ?? 0} tenant lagi` : "Belum bisa dihitung"}</p>
                <p className="mt-1 text-[11px] text-[var(--pp-muted)]">
                  Rata-rata/tenant: {bound.key === "RAM" || bound.key === "DISK"
                    ? formatBytes(bound.avgPerTenant)
                    : Math.round(bound.avgPerTenant).toLocaleString("id-ID")}
                </p>
                {bound.reason ? <p className="mt-1 text-[11px] text-[var(--pp-muted)]">{bound.reason}</p> : null}
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--pp-muted)]">
            {capacity.note} Sumber batas: {data.capacity.source === "saved" ? "tersimpan" : "pengukuran live"}. Bagian paling penuh: {capacity.fullestResource ?? "belum diketahui"}. Batas penentu: {capacity.fullest ?? "belum ada"}.
            {capacity.missingLimits.length > 0 ? ` Belum bisa dihitung: ${capacity.missingLimits.join(", ")}.` : ""}
          </p>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div><Label htmlFor="cap-cpu">Core CPU</Label><Input id="cap-cpu" inputMode="numeric" value={capacityForm.cpuCores} onChange={(event) => setCapacityForm((current) => ({ ...current, cpuCores: event.target.value }))} /></div>
            <div><Label htmlFor="cap-ram">RAM (GB)</Label><Input id="cap-ram" inputMode="decimal" value={capacityForm.ramGb} onChange={(event) => setCapacityForm((current) => ({ ...current, ramGb: event.target.value }))} /></div>
            <div><Label htmlFor="cap-disk">Disk (GB)</Label><Input id="cap-disk" inputMode="decimal" value={capacityForm.diskGb} onChange={(event) => setCapacityForm((current) => ({ ...current, diskGb: event.target.value }))} /></div>
            <div><Label htmlFor="cap-wa">Sesi WhatsApp</Label><Input id="cap-wa" inputMode="numeric" value={capacityForm.waSessions} onChange={(event) => setCapacityForm((current) => ({ ...current, waSessions: event.target.value }))} /></div>
            <div><Label htmlFor="cap-msg">Pesan / bulan</Label><Input id="cap-msg" inputMode="numeric" value={capacityForm.monthlyMessages} onChange={(event) => setCapacityForm((current) => ({ ...current, monthlyMessages: event.target.value }))} /></div>
            <div><Label htmlFor="cap-vps">Biaya VPS (Rp)</Label><Input id="cap-vps" inputMode="decimal" value={vpsCost} onChange={(event) => setVpsCost(event.target.value)} /></div>
          </div>
          <Button disabled={busy} onClick={() => void saveSettings()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Simpan batas & biaya</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />Promo & voucher</CardTitle>
              <CardDescription>Promo hanya untuk pembelian pertama. Perpanjangan tahun kedua memakai harga normal yang terkunci.</CardDescription>
            </div>
            <Button onClick={() => setPromoEditor({ open: true, promo: null })}><Plus className="mr-2 h-4 w-4" />Buat promo</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.promos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--pp-line)] p-6 text-center text-sm text-[var(--pp-muted)]">Belum ada promo.</p>
          ) : data.promos.map((promo) => (
            <div key={promo.id} className="rounded-lg border border-[var(--pp-line)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{promo.name}</p>
                    <Badge variant={promo.enabled ? "outline" : "secondary"}>{promo.enabled ? "AKTIF" : "NONAKTIF"}</Badge>
                    <Badge variant="outline">{promo.kind}</Badge>
                    <Badge variant="outline">{promo.billingScope === "BOTH" ? "BULANAN + TAHUNAN" : promo.billingScope}</Badge>
                    {promo.code ? <Badge variant="outline">{promo.code}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--pp-muted)]">
                    {promo.percent ? `Diskon ${promo.percent}%` : "Harga tetap per paket"}
                    {" · "}{formatDate(promo.startsAt)} – {formatDate(promo.endsAt)}
                    {" · "}dipakai {promo.usage.active} kali
                    {promo.usageLimitTotal ? ` dari ${promo.usageLimitTotal}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--pp-muted)]">
                    Paket: {promo.plans.map((item) => {
                      const plan = data.plans.find((candidate) => candidate.id === item.planId);
                      return `${plan?.name ?? item.planId}${item.fixedPrice ? ` (${formatRupiah(item.fixedPrice)})` : ""}`;
                    }).join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={promo.enabled ? "outline" : "default"} disabled={busy} onClick={() => void togglePromo(promo)}>{promo.enabled ? "Matikan" : "Nyalakan"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setPromoEditor({ open: true, promo })}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void deletePromo(promo)} aria-label={`Hapus ${promo.name}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {promoEditor.open ? (
        <PromoEditor
          promo={promoEditor.promo}
          plans={data.plans.filter((plan) => plan.isActive)}
          onClose={() => setPromoEditor({ open: false, promo: null })}
          onSaved={async () => { setPromoEditor({ open: false, promo: null }); await load(); }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Verifikasi pembayaran</CardTitle>
          <CardDescription>{data.pendingPayments.length} pembayaran menunggu. Setujui untuk mengaktifkan paket dan mengunci harga perpanjangan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.pendingPayments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--pp-line)] p-6 text-center text-sm text-[var(--pp-muted)]">Tidak ada pembayaran menunggu.</p>
          ) : data.pendingPayments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-[var(--pp-line)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{payment.user.email}</p>
                <Badge variant="outline">{payment.billingCycle === "YEARLY" ? "TAHUNAN" : "BULANAN"}</Badge>
                <Badge variant="secondary">{payment.plan?.name ?? "Paket tidak dikenal"}</Badge>
                {payment.voucherCode ? <Badge variant="outline">{payment.voucherCode}</Badge> : null}
              </div>
              <p className="mt-1 text-sm">
                {formatRupiah(payment.amount)}
                {Number(payment.discountAmount) > 0 ? ` · diskon ${formatRupiah(payment.discountAmount)}` : ""}
                {" · "}{payment.reference ?? "tanpa referensi"}
              </p>
              <p className="mt-1 text-xs text-[var(--pp-muted)]">
                {payment.user.whatsappNumber ?? "Nomor WA belum ada"} · {formatDate(payment.createdAt)}
                {payment.bankAccount ? ` · ${payment.bankAccount.bankName} ${payment.bankAccount.accountNumber} a.n. ${payment.bankAccount.accountHolder}` : ""}
              </p>
              {payment.proofUrl ? <a className="mt-1 inline-block text-sm font-semibold underline underline-offset-4" href={payment.proofUrl} target="_blank" rel="noreferrer">Lihat bukti transfer</a> : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={reviewNotes[payment.id] ?? ""}
                  onChange={(event) => setReviewNotes((current) => ({ ...current, [payment.id]: event.target.value }))}
                  placeholder="Catatan pemeriksaan, minimal 3 karakter"
                  aria-label={`Catatan untuk ${payment.user.email}`}
                />
                <div className="flex gap-2">
                  <Button disabled={reviewingId === payment.id} onClick={() => void reviewPayment(payment.id, "APPROVED")}>
                    {reviewingId === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Setujui
                  </Button>
                  <Button variant="outline" disabled={reviewingId === payment.id} onClick={() => void reviewPayment(payment.id, "REJECTED")}>Tolak</Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-5 w-5" />Harga paket</CardTitle>
          <CardDescription>Perubahan harga dicatat ke riwayat. Tenant lama tetap memakai harga perpanjangan yang terkunci.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {data.plans.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-[var(--pp-line)] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{plan.name}</p>
                <Badge variant={plan.isActive ? "outline" : "secondary"}>{plan.code}</Badge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`price-m-${plan.id}`}>Bulanan</Label>
                  <Input id={`price-m-${plan.id}`} inputMode="decimal" value={planPrices[plan.id]?.monthly ?? ""} onChange={(event) => setPlanPrices((current) => ({ ...current, [plan.id]: { ...current[plan.id], monthly: event.target.value } }))} />
                </div>
                <div>
                  <Label htmlFor={`price-y-${plan.id}`}>Tahunan</Label>
                  <Input id={`price-y-${plan.id}`} inputMode="decimal" value={planPrices[plan.id]?.yearly ?? ""} onChange={(event) => setPlanPrices((current) => ({ ...current, [plan.id]: { ...current[plan.id], yearly: event.target.value } }))} placeholder="Kosongkan jika tidak ada" />
                </div>
              </div>
              <Button className="mt-3 w-full" variant="outline" disabled={busy} onClick={() => void savePlanPrice(plan)}>Simpan harga</Button>
              {plan.priceHistory.length > 0 ? (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">Riwayat terakhir</p>
                  {plan.priceHistory.slice(0, 4).map((item) => (
                    <p key={item.id} className="text-xs text-[var(--pp-muted)]">
                      {item.field === "MONTHLY" ? "Bulanan" : "Tahunan"}: {item.oldPrice ? formatRupiah(item.oldPrice) : "—"} → {item.newPrice ? formatRupiah(item.newPrice) : "—"}
                      {" · "}{formatDate(item.changedAt)} · {item.changedBy.name ?? item.changedBy.email}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Antrean & bisnis</CardTitle><CardDescription>Aktif memantau agar gangguan pengiriman terlihat di layar yang sama.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.vps.queues.map((queue) => (
            <div key={queue.name} className="rounded-lg border border-[var(--pp-line)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">{queue.name}</p>
              <p className="mt-1 text-sm">{queue.pending} menunggu · {queue.processing} proses</p>
              <p className={cn("text-xs", queue.failed > 0 ? "font-semibold text-red-600" : "text-[var(--pp-muted)]")}>{queue.failed} gagal</p>
            </div>
          ))}
          <MiniStat label="Pesan bulan ini" value={data.business.sentMessages.toLocaleString("id-ID")} />
          <MiniStat label="Media tersimpan" value={formatBytes(data.business.storageBytes)} />
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">{label}</p>
          <span className="text-[var(--pp-muted)]">{icon}</span>
        </div>
        <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-[var(--pp-muted)]">{note}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
      <p className="text-xs text-[var(--pp-muted)]">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function HealthRow({ icon, label, value, percent, tone = "ok" }: { icon: React.ReactNode; label: string; value: string; percent: number; tone?: "ok" | "critical" }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-[var(--pp-muted)]">{icon}{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--pp-paper)]">
        <div className={cn("h-full", tone === "critical" ? "bg-red-500" : percent > 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

function PromoEditor({ promo, plans, onClose, onSaved }: { promo: Promo | null; plans: Plan[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(promo?.name ?? "");
  const [description, setDescription] = useState(promo?.description ?? "");
  const [kind, setKind] = useState<Promo["kind"]>(promo?.kind ?? "PERCENT");
  const [percent, setPercent] = useState(promo?.percent ?? "");
  const [code, setCode] = useState(promo?.code ?? "");
  const [enabled, setEnabled] = useState(promo?.enabled ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(promo?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(promo?.endsAt ?? null));
  const [billingScope, setBillingScope] = useState<Promo["billingScope"]>(promo?.billingScope ?? "BOTH");
  const [usageLimitTotal, setUsageLimitTotal] = useState(promo?.usageLimitTotal ? String(promo.usageLimitTotal) : "");
  const [usageLimitPerUser, setUsageLimitPerUser] = useState(promo?.usageLimitPerUser ? String(promo.usageLimitPerUser) : "");
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(
    (promo?.plans ?? plans.map((plan) => ({ planId: plan.id, fixedPrice: null }))).map((item) => [item.planId, item.fixedPrice ?? ""]),
  ));
  const [saving, setSaving] = useState(false);

  const togglePlan = (planId: string, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[planId] = next[planId] ?? "";
      else delete next[planId];
      return next;
    });
  };

  const submit = async () => {
    const planIds = Object.keys(selected);
    if (planIds.length === 0) return toast.error("Pilih minimal satu paket.");
    setSaving(true);
    try {
      const payload = {
        name,
        description: description.trim() || null,
        kind,
        percent: kind === "FIXED" ? null : percent.trim() || null,
        code: kind === "VOUCHER" ? code.trim().toUpperCase() : null,
        enabled,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        billingScope,
        usageLimitTotal: usageLimitTotal ? Number(usageLimitTotal) : null,
        usageLimitPerUser: usageLimitPerUser ? Number(usageLimitPerUser) : null,
        plans: planIds.map((planId) => ({
          planId,
          fixedPrice: kind === "PERCENT" ? null : selected[planId].trim() || null,
        })),
      };
      const response = await fetch(promo ? `/api/admin/promos/${promo.id}` : "/api/admin/promos", {
        method: promo ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Promo gagal disimpan.");
      toast.success(promo ? "Promo diperbarui." : "Promo dibuat.");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Promo gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Editor promo">
      <div className="my-8 w-full max-w-3xl rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{promo ? "Edit promo" : "Buat promo"}</h2>
            <p className="text-sm text-[var(--pp-muted)]">Promo otomatis dan voucher hanya berlaku untuk pembelian pertama.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Tutup"><X className="h-4 w-4" /></Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><Label>Nama promo</Label><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></div>
          <div>
            <Label>Jenis</Label>
            <select className="h-10 w-full rounded-md border border-[var(--pp-line)] bg-[var(--pp-white)] px-3 text-sm" value={kind} onChange={(event) => setKind(event.target.value as Promo["kind"])}>
              <option value="PERCENT">Persen otomatis</option>
              <option value="FIXED">Harga tetap otomatis</option>
              <option value="VOUCHER">Kode voucher</option>
            </select>
          </div>
          <div><Label>Deskripsi (opsional)</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></div>
          <div>
            <Label>Berlaku untuk</Label>
            <select className="h-10 w-full rounded-md border border-[var(--pp-line)] bg-[var(--pp-white)] px-3 text-sm" value={billingScope} onChange={(event) => setBillingScope(event.target.value as Promo["billingScope"])}>
              <option value="BOTH">Bulanan dan tahunan</option>
              <option value="MONTHLY">Bulanan saja</option>
              <option value="YEARLY">Tahunan saja</option>
            </select>
            <p className="mt-1 text-xs text-[var(--pp-muted)]">
              SuperAdmin yang menentukan siklusnya. Satu harga akhir dipakai untuk siklus yang dipilih; kalau mau harga berbeda untuk bulanan dan tahunan, buat dua promo dengan pilihan berbeda.
            </p>
          </div>
          {kind !== "FIXED" ? <div><Label>Persen diskon</Label><Input value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="decimal" placeholder="Contoh: 20" /></div> : null}
          {kind === "VOUCHER" ? <div><Label>Kode voucher</Label><Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={64} placeholder="HEMAT20" /></div> : null}
          <div><Label>Mulai</Label><Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
          <div><Label>Selesai</Label><Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
          <div><Label>Kuota total (opsional)</Label><Input inputMode="numeric" value={usageLimitTotal} onChange={(event) => setUsageLimitTotal(event.target.value)} /></div>
          <div><Label>Kuota per pengguna (opsional)</Label><Input inputMode="numeric" value={usageLimitPerUser} onChange={(event) => setUsageLimitPerUser(event.target.value)} /></div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Aktifkan promo ini sekarang
        </label>

        <div className="mt-4">
          <p className="text-sm font-semibold">Paket yang ikut promo</p>
          {kind !== "PERCENT" ? <p className="mt-1 text-xs text-[var(--pp-muted)]">Harga akhir harus lebih murah dari harga normal pada siklus yang dipilih di atas.</p> : null}
          <div className="mt-2 space-y-2">
            {plans.map((plan) => {
              const checked = Object.prototype.hasOwnProperty.call(selected, plan.id);
              return (
                <div key={plan.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--pp-line)] p-3">
                  <label className="flex flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={(event) => togglePlan(plan.id, event.target.checked)} />
                    {plan.name} · {formatRupiah(plan.priceMonthly)}/bulan
                  </label>
                  {checked && kind !== "PERCENT" ? (
                    <Input
                      className="w-40"
                      inputMode="decimal"
                      placeholder="Harga akhir"
                      value={selected[plan.id] ?? ""}
                      onChange={(event) => setSelected((current) => ({ ...current, [plan.id]: event.target.value }))}
                      aria-label={`Harga akhir ${plan.name}`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={() => void submit()} disabled={saving || name.trim().length < 2}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simpan promo
          </Button>
        </div>
      </div>
    </div>
  );
}
