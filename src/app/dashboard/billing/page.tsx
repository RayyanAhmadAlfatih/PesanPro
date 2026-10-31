"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Copy,
  CreditCard,
  FileUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCommercialFeatureVisible } from "@/lib/access-policy";
import { cn } from "@/lib/utils";

interface BillingSummary {
  role: string;
  status: string;
  startsAt?: string;
  endsAt?: string | null;
  graceEndsAt?: string | null;
  plan: { code: string; name: string; unlimited: boolean };
  entitlements: Array<{ feature: string; enabled: boolean; limit: string | null }>;
  usage: Array<{ feature: string; consumed: string; reserved: string; periodEnd: string }>;
}

interface AvailablePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: string | null;
  priceYearly: string | null;
  currency: string;
  entitlements: Array<{ feature: string; enabled: boolean; limitValue: string | null }>;
}

interface PaymentSubmission {
  id: string;
  amount: string;
  billingCycle: string;
  currency: string;
  reference: string | null;
  proofUrl: string | null;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
  plan: { code: string; name: string } | null;
}

const FEATURE_LABELS: Record<string, string> = {
  API_ACCESS: "Akses API untuk developer",
  API_KEYS: "Kunci API untuk developer",
  DEVICES: "Nomor WhatsApp",
  MESSAGES_MONTHLY: "Pesan per bulan",
  API_REQUESTS_MONTHLY: "Permintaan API per bulan",
  SCHEDULED_MESSAGES: "Pesan terjadwal",
  BROADCASTS_MONTHLY: "Broadcast per bulan",
  BROADCAST_RECIPIENTS_PER_BATCH: "Penerima per broadcast",
  BROADCAST_MIN_DELAY_MS: "Jeda antar pesan",
  CAMPAIGNS_MONTHLY: "Kampanye per bulan",
  AUTOREPLY_RULES: "Balasan otomatis",
  WEBHOOKS: "Webhook, notifikasi ke sistem lain",
  API_REQUESTS_PER_MINUTE: "Permintaan API per menit",
  MEDIA_STORAGE_BYTES: "Penyimpanan media",
  MEDIA_MAX_UPLOAD_BYTES: "Ukuran maksimal per file",
};

const USAGE_ROWS = [
  { feature: "MESSAGES_MONTHLY", label: "Pesan terkirim" },
  { feature: "BROADCASTS_MONTHLY", label: "Broadcast" },
  { feature: "MEDIA_STORAGE_BYTES", label: "Penyimpanan media" },
] as const;

const PLAN_TAGLINES: Record<string, string> = {
  STARTER: "Untuk usaha yang baru mulai.",
  BISNIS: "Untuk toko yang makin ramai.",
  PRO: "Untuk tim dengan banyak nomor.",
};

const PAYMENT_STATUS: Record<string, { label: string; note: string; tone: string }> = {
  PENDING: {
    label: "Menunggu pemeriksaan",
    note: "Admin sedang memeriksa bukti Anda.",
    tone: "bg-[var(--pp-highlight)] text-[var(--pp-ink)]",
  },
  APPROVED: {
    label: "Disetujui",
    note: "Pembayaran diterima dan paket sudah aktif.",
    tone: "bg-[var(--pp-mint)] text-[var(--pp-ink)]",
  },
  REJECTED: {
    label: "Ditolak",
    note: "Perbaiki sesuai catatan admin, lalu kirim ulang.",
    tone: "border-[var(--pp-danger)] bg-[var(--pp-danger)] text-white",
  },
  CANCELLED: {
    label: "Dibatalkan",
    note: "Pembayaran ini dibatalkan.",
    tone: "bg-[var(--pp-blush)] text-[var(--pp-ink)]",
  },
};

function formatRupiah(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Belum ditentukan";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("id-ID").format(amount);
}

function formatBytes(value: string | number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${Number((mb / 1024).toFixed(1))} GB`;
  if (mb >= 1) return `${Number(mb.toFixed(1))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFeatureValue(feature: string, value: string | null) {
  if (value === null) return "Tanpa batas";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Tidak termasuk";
  if (feature === "MEDIA_STORAGE_BYTES" || feature === "MEDIA_MAX_UPLOAD_BYTES") {
    return formatBytes(amount);
  }
  if (feature === "BROADCAST_MIN_DELAY_MS") return `${Math.round(amount / 1000)} detik`;
  return formatNumber(amount);
}

function formatUsageValue(feature: string, value: number) {
  if (feature === "MEDIA_STORAGE_BYTES") return formatBytes(value);
  return formatNumber(value);
}

function planTagline(plan: AvailablePlan) {
  return PLAN_TAGLINES[plan.code] ?? plan.description ?? "Paket langganan PesanPro.";
}

function planHighlights(plan: AvailablePlan) {
  const get = (feature: string) =>
    plan.entitlements.find((item) => item.feature === feature && item.enabled);
  const highlights: string[] = [];

  const devices = get("DEVICES");
  if (devices?.limitValue) highlights.push(`${formatNumber(devices.limitValue)} nomor WhatsApp`);

  const messages = get("MESSAGES_MONTHLY");
  if (messages?.limitValue) highlights.push(`${formatNumber(messages.limitValue)} pesan per bulan`);

  const broadcasts = get("BROADCASTS_MONTHLY");
  if (broadcasts?.limitValue) highlights.push(`${formatNumber(broadcasts.limitValue)} broadcast per bulan`);

  const recipients = get("BROADCAST_RECIPIENTS_PER_BATCH");
  if (recipients?.limitValue) highlights.push(`${formatNumber(recipients.limitValue)} penerima per broadcast`);

  const autoReply = get("AUTOREPLY_RULES");
  if (autoReply) {
    highlights.push(autoReply.limitValue === null
      ? "Balasan otomatis tanpa batas"
      : `${formatNumber(autoReply.limitValue)} balasan otomatis`);
  }

  const upload = get("MEDIA_MAX_UPLOAD_BYTES");
  if (upload?.limitValue) highlights.push(`File maksimal ${formatBytes(upload.limitValue)}`);

  return highlights.length > 0 ? highlights : ["Semua fitur utama tersedia."];
}

function yearlySaving(plan: AvailablePlan) {
  const monthly = Number(plan.priceMonthly ?? 0);
  const yearly = Number(plan.priceYearly ?? 0);
  if (monthly <= 0 || yearly <= 0) return null;
  const fullYear = monthly * 12;
  if (yearly >= fullYear) return null;
  return fullYear - yearly;
}

function subscriptionStatus(billing: BillingSummary | null) {
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

function paymentStatus(status: string) {
  return PAYMENT_STATUS[status] ?? {
    label: status,
    note: "",
    tone: "bg-[var(--pp-paper)] text-[var(--pp-ink)]",
  };
}

function cycleLabel(cycle: string) {
  return cycle === "YEARLY" ? "12 bulan" : "1 bulan";
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<AvailablePlan[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentPlanId, setPaymentPlanId] = useState("");
  const [paymentCycle, setPaymentCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [proofInputKey, setProofInputKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [billingResponse, planResponse, paymentResponse] = await Promise.all([
        fetch("/api/billing/summary", { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
        fetch("/api/payment-verifications", { cache: "no-store" }),
      ]);
      if (!billingResponse.ok && billingResponse.status !== 404) {
        throw new Error("Data tagihan tidak bisa dimuat.");
      }
      const summary = billingResponse.ok
        ? ((await billingResponse.json()).data as BillingSummary | null)
        : null;
      setBilling(summary ? {
        ...summary,
        entitlements: summary.entitlements.filter((item) => isCommercialFeatureVisible(item.feature)),
        usage: summary.usage.filter((item) => isCommercialFeatureVisible(item.feature)),
      } : null);
      if (planResponse.ok) setPlans((await planResponse.json()).data ?? []);
      if (paymentResponse.ok) setPayments((await paymentResponse.json()).data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Data tagihan tidak bisa dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submitPayment = async () => {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("planId", paymentPlanId);
      form.set("billingCycle", paymentCycle);
      form.set("reference", paymentReference);
      if (paymentProof) form.set("proof", paymentProof);
      const response = await fetch("/api/payment-verifications", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Bukti pembayaran gagal dikirim.");
      toast.success("Bukti pembayaran terkirim. Statusnya muncul di riwayat pembayaran.");
      setPaymentPlanId("");
      setPaymentReference("");
      setPaymentProof(null);
      setProofInputKey((current) => current + 1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bukti pembayaran gagal dikirim.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Memuat data tagihan" />
      </div>
    );
  }

  const usageMap = new Map(billing?.usage.map((item) => [item.feature, item]));
  const status = subscriptionStatus(billing);
  const pendingPlan = billing?.plan.code === "PENDING";

  const selectedPlan = plans.find((plan) => plan.id === paymentPlanId) ?? null;
  const selectedSaving = selectedPlan ? yearlySaving(selectedPlan) : null;
  let paymentAmount = "";
  if (selectedPlan) {
    paymentAmount = (paymentCycle === "YEARLY" ? selectedPlan.priceYearly : selectedPlan.priceMonthly) ?? "";
  }
  const paymentAmountMissing = selectedPlan !== null && paymentAmount === "";
  const proofTooLarge = paymentProof !== null && paymentProof.size > 5 * 1024 * 1024;
  const referenceReady = paymentReference.trim().length >= 3;
  const formReady = Boolean(paymentPlanId) && !paymentAmountMissing && referenceReady && Boolean(paymentProof) && !proofTooLarge;

  const requirements = [
    { done: Boolean(paymentPlanId), label: "Paket sudah dipilih" },
    { done: referenceReady, label: "Nama pengirim atau kode referensi sudah diisi" },
    { done: Boolean(paymentProof) && !proofTooLarge, label: "Bukti transfer sudah dilampirkan, maksimal 5 MB" },
  ];

  const usageRows = USAGE_ROWS.flatMap((row) => {
    const entitlement = billing?.entitlements.find((item) => item.feature === row.feature && item.enabled);
    if (!entitlement) return [];
    const usage = usageMap.get(row.feature);
    const used = Number(usage?.consumed ?? 0) + Number(usage?.reserved ?? 0);
    const limit = entitlement.limit === null ? null : Number(entitlement.limit);
    return [{ ...row, used, limit }];
  });

  const copyAmount = async () => {
    if (!paymentAmount) return;
    try {
      await navigator.clipboard.writeText(String(Number(paymentAmount)));
      toast.success("Nominal disalin.");
    } catch {
      toast.error("Nominal tidak bisa disalin. Tulis manual dari angka di atas.");
    }
  };

  const selectPlan = (planId: string) => {
    setPaymentPlanId(planId);
    window.setTimeout(() => {
      document.getElementById("form-pembayaran")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <div className="space-y-8 p-4 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--pp-muted)]">Langganan</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Tagihan</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
            Lihat paket yang sedang dipakai, sisa kuota, dan kirim bukti pembayaran. Status di halaman ini selalu mengikuti data terbaru.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Muat ulang
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className={cn("shadow-none", status.surface)}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CreditCard className="h-7 w-7 text-[var(--pp-ink)]" aria-hidden="true" />
              <Badge className={status.tone}>{status.label}</Badge>
            </div>
            <CardTitle className="mt-2 text-2xl">
              {pendingPlan ? "Belum ada paket aktif" : billing?.plan.name ?? "Belum ada paket"}
            </CardTitle>
            <CardDescription className="text-[var(--pp-ink)]/80">{status.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {billing?.endsAt && billing.status === "ACTIVE" && !pendingPlan ? (
              <p>
                Berlaku sampai <strong>{formatDate(billing.endsAt)}</strong>.
              </p>
            ) : null}
            {billing?.graceEndsAt && billing.status === "GRACE_PERIOD" ? (
              <p>
                Masa tenggang sampai <strong>{formatDate(billing.graceEndsAt)}</strong>.
              </p>
            ) : null}
            {pendingPlan ? (
              <p className="text-[var(--pp-ink)]/80">
                Pengiriman, balasan otomatis, webhook, dan unggah media aktif setelah pembayaran disetujui.
              </p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => document.getElementById("pilih-paket")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Lihat pilihan paket
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pemakaian periode ini</CardTitle>
            <CardDescription>
              Dihitung sejak paket aktif, bukan awal bulan kalender. Angka diperbarui otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {pendingPlan || usageRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--pp-line)] bg-[var(--pp-paper)] p-4">
                <p className="font-semibold">Belum ada pemakaian</p>
                <p className="mt-1 text-sm text-[var(--pp-muted)]">
                  Setelah paket aktif dan Anda mulai mengirim pesan, angka pemakaian muncul di sini.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {usageRows.map((row) => {
                  const percent = row.limit && row.limit > 0
                    ? Math.min(100, Math.round((row.used / row.limit) * 100))
                    : null;
                  const barTone = percent === null
                    ? "bg-[var(--pp-ink)]"
                    : percent >= 100
                      ? "bg-[var(--pp-danger)]"
                      : percent >= 80
                        ? "bg-[var(--pp-terracotta)]"
                        : "bg-[var(--pp-ink)]";
                  return (
                    <div key={row.feature}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{row.label}</span>
                        <span className="tabular-nums text-[var(--pp-muted)]">
                          {formatUsageValue(row.feature, row.used)}
                          {" / "}
                          {row.limit === null ? "Tanpa batas" : formatUsageValue(row.feature, row.limit)}
                        </span>
                      </div>
                      {percent !== null ? (
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pp-line)]/40"
                          role="progressbar"
                          aria-label={`${row.label} terpakai ${percent} persen`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                        >
                          <div className={cn("h-full rounded-full", barTone)} style={{ width: `${percent}%` }} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <details className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-white)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                Lihat semua batas paket
              </summary>
              <div className="grid gap-x-6 gap-y-2 border-t border-[var(--pp-line)] px-4 py-3 sm:grid-cols-2">
                {(billing?.entitlements ?? [])
                  .filter((item) => item.feature !== "CAMPAIGNS_MONTHLY")
                  .map((item) => (
                    <div key={item.feature} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-[var(--pp-muted)]">{FEATURE_LABELS[item.feature] ?? item.feature}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {item.enabled ? formatFeatureValue(item.feature, item.limit) : "Tidak termasuk"}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          </CardContent>
        </Card>
      </div>

      {billing?.role !== "SUPERADMIN" ? (
        <>
          <section id="pilih-paket" className="scroll-mt-24">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">Pilih paket</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
                Semua paket mendapat fitur yang sama. Bedanya di jumlah nomor WhatsApp, pesan per bulan, dan batas pemakaian. Pilih yang paling dekat dengan kebutuhan Anda.
              </p>
            </div>

            {plans.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-[var(--pp-line)] p-6 text-center">
                <p className="font-semibold">Paket belum bisa dimuat</p>
                <p className="mt-1 text-sm text-[var(--pp-muted)]">Klik Muat ulang. Kalau tetap kosong, hubungi admin.</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan) => {
                  const selected = paymentPlanId === plan.id;
                  const saving = yearlySaving(plan);
                  return (
                    <Card
                      key={plan.id}
                      className={cn(
                        "h-full shadow-none transition-colors",
                        selected ? "border-[var(--pp-ink)] ring-2 ring-[var(--pp-ink)]/15" : "border-[var(--pp-line)]",
                      )}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">{plan.name}</CardTitle>
                            <CardDescription className="mt-1">{planTagline(plan)}</CardDescription>
                          </div>
                          {selected ? <Badge className="bg-[var(--pp-highlight)]">Dipilih</Badge> : null}
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-1 flex-col">
                        <div>
                          <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight">
                            {formatRupiah(plan.priceMonthly)}
                          </p>
                          <p className="text-sm text-[var(--pp-muted)]">per bulan</p>
                          {plan.priceYearly ? (
                            <p className="mt-2 text-xs leading-relaxed text-[var(--pp-muted)]">
                              atau {formatRupiah(plan.priceYearly)} per tahun
                              {saving ? `, hemat ${formatRupiah(saving)}` : ""}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-[var(--pp-muted)]">Pembayaran tahunan belum tersedia.</p>
                          )}
                        </div>

                        <ul className="mt-5 space-y-2 text-sm">
                          {planHighlights(plan).map((highlight) => (
                            <li key={highlight} className="flex gap-2">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pp-ink)]" aria-hidden="true" />
                              <span>{highlight}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-auto pt-6">
                          <Button
                            type="button"
                            variant={selected ? "default" : "outline"}
                            className="w-full"
                            aria-pressed={selected}
                            onClick={() => selectPlan(plan.id)}
                          >
                            {selected ? "Paket dipilih" : `Pilih ${plan.name}`}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card id="form-pembayaran" className="scroll-mt-24">
              <CardHeader>
                <CardTitle>Kirim bukti pembayaran</CardTitle>
                <CardDescription>
                  Sudah transfer? Unggah bukti transfer di sini. Admin akan memeriksa bukti Anda, lalu paket aktif setelah disetujui.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ol className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["1. Transfer", "Bayar sesuai nominal di bawah."],
                    ["2. Unggah bukti", "Foto struk atau screenshot transfer."],
                    ["3. Tunggu", "Admin memeriksa, lalu paket aktif."],
                  ].map(([title, body]) => (
                    <li key={title} className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--pp-muted)]">{body}</p>
                    </li>
                  ))}
                </ol>

                <div className="space-y-2">
                  <Label htmlFor="payment-plan">Paket yang dipilih</Label>
                  <select
                    id="payment-plan"
                    className="h-11 w-full rounded-md border border-[var(--pp-line)] bg-[var(--pp-white)] px-3 text-sm"
                    value={paymentPlanId}
                    onChange={(event) => setPaymentPlanId(event.target.value)}
                  >
                    <option value="">Pilih paket</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {formatRupiah(plan.priceMonthly)} per bulan
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--pp-muted)]">Paket yang dipilih di atas akan aktif setelah pembayaran disetujui.</p>
                </div>

                <div className="space-y-2">
                  <Label>Lama langganan</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={paymentCycle === "MONTHLY" ? "default" : "outline"}
                      className="w-full"
                      aria-pressed={paymentCycle === "MONTHLY"}
                      onClick={() => setPaymentCycle("MONTHLY")}
                    >
                      1 bulan
                    </Button>
                    <Button
                      type="button"
                      variant={paymentCycle === "YEARLY" ? "default" : "outline"}
                      className="w-full"
                      aria-pressed={paymentCycle === "YEARLY"}
                      onClick={() => setPaymentCycle("YEARLY")}
                    >
                      12 bulan
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--pp-muted)]">
                    {selectedSaving
                      ? `Bayar setahun sekali lebih murah ${formatRupiah(selectedSaving)} dibanding bayar bulanan.`
                      : "Bayar setahun sekali untuk 12 bulan pemakaian."}
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-highlight)]/25 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">
                    Jumlah yang harus ditransfer
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums" aria-live="polite">
                      {paymentAmount
                        ? formatRupiah(paymentAmount)
                        : paymentAmountMissing
                          ? "Harga tahunan belum tersedia"
                          : "Pilih paket dulu"}
                    </p>
                    {paymentAmount ? (
                      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void copyAmount()}>
                        <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Salin
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--pp-muted)]">
                    Transfer tepat sebesar ini. Jangan ditambah atau dikurangi agar admin mudah mencocokkan. Belum tahu nomor rekening tujuan? Tanyakan ke admin sebelum transfer.
                  </p>
                  {paymentAmountMissing ? (
                    <p className="mt-2 text-xs font-medium text-[var(--pp-danger)]">
                      Paket ini belum punya harga tahunan. Pilih 1 bulan atau paket lain.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-reference">Nama pengirim atau kode referensi</Label>
                  <Input
                    id="payment-reference"
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="Contoh: Ayu Setiawan"
                    maxLength={120}
                    aria-describedby="payment-reference-help"
                  />
                  <p id="payment-reference-help" className="text-xs text-[var(--pp-muted)]">
                    Tulis nama yang muncul di mutasi bank, atau kode unik transfer. Ini membantu admin menemukan pembayaran Anda.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment-proof">Bukti transfer</Label>
                  <div className="relative">
                    <Input
                      key={proofInputKey}
                      id="payment-proof"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="peer sr-only"
                      onChange={(event) => setPaymentProof(event.target.files?.[0] ?? null)}
                      aria-describedby="payment-proof-help"
                    />
                    <label
                      htmlFor="payment-proof"
                      className={cn(
                        "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors",
                        "border-[var(--pp-line)] bg-[var(--pp-white)] hover:bg-[var(--pp-paper)]",
                        "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring",
                        proofTooLarge ? "border-[var(--pp-danger)]" : "",
                      )}
                    >
                      <FileUp className="h-6 w-6 text-[var(--pp-ink)]" aria-hidden="true" />
                      <span className="max-w-full truncate text-sm font-semibold" title={paymentProof?.name}>
                        {paymentProof ? paymentProof.name : "Pilih foto atau PDF"}
                      </span>
                      <span className="text-xs text-[var(--pp-muted)]">
                        {paymentProof
                          ? `${formatBytes(paymentProof.size)}. Klik untuk mengganti.`
                          : "JPG, PNG, WebP, atau PDF. Maksimal 5 MB."}
                      </span>
                    </label>
                  </div>
                  <p id="payment-proof-help" className="text-xs text-[var(--pp-muted)]">
                    Unggah foto struk transfer, screenshot m-banking, atau PDF bukti transfer. Pastikan nominal dan tanggal terlihat jelas.
                  </p>
                  {proofTooLarge ? (
                    <p className="text-xs font-medium text-[var(--pp-danger)]">
                      File terlalu besar. Kecilkan sampai di bawah 5 MB, lalu pilih lagi.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-4">
                  <p className="text-sm font-semibold">Sebelum mengirim, pastikan:</p>
                  <ul className="mt-2 space-y-1.5">
                    {requirements.map((item) => (
                      <li key={item.label} className="flex items-start gap-2 text-sm">
                        {item.done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pp-ink)]" aria-hidden="true" />
                        ) : (
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pp-muted)]" aria-hidden="true" />
                        )}
                        <span className={item.done ? "" : "text-[var(--pp-muted)]"}>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button className="w-full" disabled={submitting || !formReady} onClick={() => void submitPayment()}>
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {submitting ? "Mengirim bukti..." : "Kirim bukti pembayaran"}
                </Button>
                <p className="text-center text-xs leading-relaxed text-[var(--pp-muted)]">
                  Setelah terkirim, bukti tidak bisa diubah. Kalau ada kesalahan, tunggu keputusan admin lalu kirim ulang.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Riwayat pembayaran</CardTitle>
                <CardDescription>Semua bukti yang pernah Anda kirim, beserta keputusan admin.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {payments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--pp-line)] p-6 text-center">
                    <Clock3 className="mx-auto h-6 w-6 text-[var(--pp-muted)]" aria-hidden="true" />
                    <p className="mt-2 font-semibold">Belum ada pembayaran</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--pp-muted)]">
                      Setelah Anda mengirim bukti, statusnya muncul di sini.
                    </p>
                  </div>
                ) : (
                  payments.map((payment) => {
                    const info = paymentStatus(payment.status);
                    return (
                      <div key={payment.id} className="rounded-lg border border-[var(--pp-line)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{payment.plan?.name ?? "Paket"}</p>
                            <p className="mt-0.5 text-sm text-[var(--pp-muted)]">
                              {formatRupiah(payment.amount)} · {cycleLabel(payment.billingCycle)}
                            </p>
                          </div>
                          <Badge className={info.tone}>{info.label}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-[var(--pp-muted)]">
                          Dikirim {formatDateTime(payment.createdAt)}
                        </p>
                        {payment.reference ? (
                          <p className="mt-1 text-xs text-[var(--pp-muted)]">Referensi: {payment.reference}</p>
                        ) : null}
                        <p className="mt-2 text-sm">{info.note}</p>
                        {payment.proofUrl ? (
                          <a
                            className="mt-2 inline-block text-sm font-semibold underline underline-offset-4"
                            href={payment.proofUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Lihat bukti transfer
                          </a>
                        ) : null}
                        {payment.reviewNote ? (
                          <div className="mt-2 rounded-md bg-[var(--pp-paper)] p-2 text-sm">
                            <span className="font-semibold">Catatan admin: </span>
                            {payment.reviewNote}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-[var(--pp-muted)]">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Pembayaran diverifikasi manual oleh admin. Harga paket sudah mencakup semua fitur yang tertera.
      </p>
    </div>
  );
}
