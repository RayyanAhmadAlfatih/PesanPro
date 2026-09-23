"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCommercialFeatureVisible } from "@/lib/access-policy";

interface BillingSummary {
  role: string;
  status: string;
  startsAt?: string;
  trialEndsAt?: string | null;
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
  currency: string;
  entitlements: Array<{ feature: string; enabled: boolean; limitValue: string | null }>;
}

interface PaymentSubmission {
  id: string;
  amount: string;
  currency: string;
  reference: string | null;
  proofUrl: string | null;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
  plan: { code: string; name: string } | null;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<AvailablePlan[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentPlanId, setPaymentPlanId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [billingResponse, planResponse, paymentResponse] = await Promise.all([
        fetch("/api/billing/summary", { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
        fetch("/api/payment-verifications", { cache: "no-store" }),
      ]);
      if (!billingResponse.ok) throw new Error("Unable to load billing information");
      const summary = (await billingResponse.json()).data as BillingSummary | null;
      setBilling(summary ? {
        ...summary,
        entitlements: summary.entitlements.filter((item) => isCommercialFeatureVisible(item.feature)),
        usage: summary.usage.filter((item) => isCommercialFeatureVisible(item.feature)),
      } : null);
      if (planResponse.ok) setPlans((await planResponse.json()).data ?? []);
      if (paymentResponse.ok) setPayments((await paymentResponse.json()).data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load billing information");
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
      const response = await fetch("/api/payment-verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: paymentPlanId, amount: paymentAmount, reference: paymentReference, proofUrl: paymentProofUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to submit payment proof");
      toast.success("Payment proof submitted for manual verification");
      setPaymentPlanId("");
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentProofUrl("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit payment proof");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const usageMap = new Map(billing?.usage.map((item) => [item.feature, item]));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--pp-ink)]">Account billing</p>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">Kelola plan, penggunaan, dan verifikasi pembayaran manual.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-[var(--pp-line)] bg-[var(--pp-mint)] shadow-none">
          <CardHeader>
            <div className="flex items-center justify-between"><CreditCard className="h-7 w-7 text-[var(--pp-ink)]" /><Badge>{billing?.status ?? "UNKNOWN"}</Badge></div>
            <CardTitle className="text-2xl">{billing?.plan.name ?? "No plan"}</CardTitle>
            <CardDescription>Plan code: {billing?.plan.code ?? "-"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{billing?.plan.unlimited ? "Commercial usage is unlimited; safety limits still apply." : "Usage is enforced atomically for this tenant."}</p>
            {billing?.trialEndsAt && <p className="text-muted-foreground">Trial ends {new Date(billing.trialEndsAt).toLocaleString()}</p>}
            {billing?.endsAt && billing.status === "ACTIVE" && <p className="text-muted-foreground">Current period ends {new Date(billing.endsAt).toLocaleString()}</p>}
            {billing?.graceEndsAt && <p className="text-amber-700">Grace period ends {new Date(billing.graceEndsAt).toLocaleString()}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Entitlements & usage</CardTitle><CardDescription>Current subscription period, sourced from the server.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {billing?.entitlements.map((item) => {
              const usage = usageMap.get(item.feature);
              return <div key={item.feature} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold tracking-wide">{item.feature}</span><ShieldCheck className={`h-4 w-4 ${item.enabled ? "text-[var(--pp-ink)]" : "text-muted-foreground"}`} /></div><p className="mt-2 text-lg font-semibold">{usage?.consumed ?? "0"} <span className="text-xs font-normal text-muted-foreground">/ {item.limit ?? "unlimited"}</span></p></div>;
            })}
          </CardContent>
        </Card>
      </div>

      {billing?.role === "USER" && <>
        <section>
          <h2 className="text-xl font-semibold">Available plans</h2>
          <p className="text-sm text-muted-foreground">Pilih plan berdasarkan kebutuhan; tidak ada tier yang dipaksakan sebagai pilihan utama.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => <Card key={plan.id} className={paymentPlanId === plan.id ? "border-[var(--pp-ink)]" : undefined}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.description || plan.code}</CardDescription></div><p className="whitespace-nowrap text-sm font-semibold">{plan.priceMonthly} {plan.currency}<span className="font-normal text-muted-foreground">/mo</span></p></div></CardHeader><CardContent><ul className="space-y-1 text-sm text-muted-foreground">{plan.entitlements.filter((item) => item.enabled).slice(0, 5).map((item) => <li key={item.feature} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pp-ink)]" /><span>{item.feature}: {item.limitValue ?? "unlimited"}</span></li>)}</ul><Button className="mt-4 w-full" variant={paymentPlanId === plan.id ? "default" : "outline"} onClick={() => { setPaymentPlanId(plan.id); setPaymentAmount(plan.priceMonthly ?? ""); }}>{paymentPlanId === plan.id ? "Selected" : "Choose plan"}</Button></CardContent></Card>)}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader><CardTitle>Submit payment proof</CardTitle><CardDescription>Setelah bukti disetujui, plan terpilih otomatis aktif untuk satu periode bulanan.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div><Label htmlFor="payment-plan">Plan</Label><select id="payment-plan" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentPlanId} onChange={(event) => { const selected = plans.find((plan) => plan.id === event.target.value); setPaymentPlanId(event.target.value); setPaymentAmount(selected?.priceMonthly ?? ""); }}><option value="">Choose plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.priceMonthly ?? "0"} {plan.currency}</option>)}</select></div>
              <div><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" value={paymentAmount} readOnly /><p className="mt-1 text-xs text-muted-foreground">Nominal dikunci ke harga plan untuk mencegah salah verifikasi.</p></div>
              <div><Label htmlFor="payment-reference">Payment reference</Label><Input id="payment-reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={120} /></div>
              <div><Label htmlFor="payment-proof">HTTPS proof URL</Label><Input id="payment-proof" type="url" value={paymentProofUrl} onChange={(event) => setPaymentProofUrl(event.target.value)} placeholder="https://..." /></div>
              <Button className="w-full" disabled={submitting || !paymentPlanId || paymentReference.trim().length < 3 || !paymentProofUrl.startsWith("https://")} onClick={() => void submitPayment()}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit for verification</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment history</CardTitle><CardDescription>Status dan catatan verifikator tersedia sebagai jejak audit.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {payments.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Belum ada pembayaran. Pilih plan untuk mengirim bukti pertama.</p>}
              {payments.map((payment) => <div key={payment.id} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{payment.plan?.name ?? "Plan"}</p><Badge variant={payment.status === "PENDING" ? "outline" : "secondary"}>{payment.status}</Badge></div><p className="text-sm text-muted-foreground">{payment.amount} {payment.currency} · {payment.reference}</p><p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</p>{payment.reviewNote && <p className="mt-2 text-sm">Catatan: {payment.reviewNote}</p>}</div>)}
            </CardContent>
          </Card>
        </div>
      </>}
    </div>
  );
}
