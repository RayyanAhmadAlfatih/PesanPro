"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeDollarSign, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isCommercialFeatureVisible } from "@/lib/access-policy";

const features = [
  "API_ACCESS", "API_KEYS", "DEVICES", "MESSAGES_MONTHLY",
  "API_REQUESTS_MONTHLY", "SCHEDULED_MESSAGES", "BROADCASTS_MONTHLY",
  "BROADCAST_RECIPIENTS_PER_BATCH", "BROADCAST_MIN_DELAY_MS", "CAMPAIGNS_MONTHLY",
  "AUTOREPLY_RULES", "WEBHOOKS", "API_REQUESTS_PER_MINUTE", "MEDIA_STORAGE_BYTES",
] as const;

const initialLimits: Record<string, string> = {
  API_ACCESS: "1", API_KEYS: "3", DEVICES: "1", MESSAGES_MONTHLY: "5000",
  API_REQUESTS_MONTHLY: "10000", SCHEDULED_MESSAGES: "50", BROADCASTS_MONTHLY: "10",
  BROADCAST_RECIPIENTS_PER_BATCH: "50", BROADCAST_MIN_DELAY_MS: "5000", CAMPAIGNS_MONTHLY: "5",
  AUTOREPLY_RULES: "20", WEBHOOKS: "3", API_REQUESTS_PER_MINUTE: "30", MEDIA_STORAGE_BYTES: "1073741824",
};

interface PlanItem {
  id: string; code: string; name: string; isActive: boolean; isDefault: boolean;
  priceMonthly: string | null; currency: string; trialDays: number;
  entitlements: Array<{ feature: string; enabled: boolean; limitValue: string | null }>;
}

interface OwnerItem {
  id: string; name: string | null; email: string; role: string; status: string;
  subscription: null | { status: string; endsAt: string | null; graceEndsAt: string | null; plan: { id: string; name: string } };
}

interface PaymentItem {
  id: string; amount: string; currency: string; reference: string | null; proofUrl: string | null;
  status: string; createdAt: string; user: { id: string; name: string | null; email: string };
  plan: { id: string; name: string } | null;
}

interface OverrideItem {
  id: string; feature: string; enabled: boolean; limitValue: string | null;
  reason: string; expiresAt: string | null; updatedAt: string;
}

export default function CommercialPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [overrides, setOverrides] = useState<OverrideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [endsAt, setEndsAt] = useState("");
  const [graceEndsAt, setGraceEndsAt] = useState("");
  const [reason, setReason] = useState("manual commercial update");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [planForm, setPlanForm] = useState({ code: "", name: "", priceMonthly: "", trialDays: "0", currency: "IDR" });
  const [limits, setLimits] = useState(initialLimits);
  const [overrideFeature, setOverrideFeature] = useState<(typeof features)[number]>("API_ACCESS");
  const [overrideEnabled, setOverrideEnabled] = useState("true");
  const [overrideLimit, setOverrideLimit] = useState("");
  const [overrideExpiresAt, setOverrideExpiresAt] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const loadOverrides = useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setOverrides([]);
      return;
    }
    const response = await fetch(`/api/admin/entitlement-overrides/${tenantId}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load entitlement overrides");
    setOverrides((body.data ?? []).filter((item: OverrideItem) => isCommercialFeatureVisible(item.feature)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planResponse, userResponse, paymentResponse] = await Promise.all([
        fetch("/api/admin/plans"), fetch("/api/users"), fetch("/api/admin/payment-verifications"),
      ]);
      if (![planResponse, userResponse, paymentResponse].every((response) => response.ok)) throw new Error("Unable to load commercial controls");
      const [planBody, userBody, paymentBody] = await Promise.all([planResponse.json(), userResponse.json(), paymentResponse.json()]);
      setPlans((planBody.data ?? []).map((plan: PlanItem) => ({
        ...plan,
        entitlements: plan.entitlements.filter((item) => isCommercialFeatureVisible(item.feature)),
      })));
      setOwners((userBody.data ?? []).filter((user: OwnerItem) => user.role === "USER"));
      setPayments(paymentBody.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load commercial controls");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverrides(ownerId).catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load entitlement overrides"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadOverrides, ownerId]);

  const createPlan = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...planForm,
          trialDays: Number(planForm.trialDays),
          priceMonthly: planForm.priceMonthly || null,
          isActive: true,
          isDefault: false,
          entitlements: features.map((feature) => ({ feature, enabled: limits[feature] !== "0", limit: limits[feature] })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create plan");
      toast.success("Plan created");
      setPlanForm({ code: "", name: "", priceMonthly: "", trialDays: "0", currency: "IDR" });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create plan");
    } finally {
      setBusy(false);
    }
  };

  const updateSubscription = async () => {
    if (!ownerId || !planId) return toast.error("Choose an owner and plan");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/subscriptions/${ownerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          status,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          graceEndsAt: graceEndsAt ? new Date(graceEndsAt).toISOString() : null,
          reason,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update subscription");
      toast.success("Subscription updated without deleting tenant data");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update subscription");
    } finally {
      setBusy(false);
    }
  };

  const reviewPayment = async (id: string, reviewStatus: "APPROVED" | "REJECTED") => {
    const reviewNote = reviewNotes[id]?.trim();
    if (!reviewNote || reviewNote.length < 3) return toast.error("Add a review note first");
    const response = await fetch(`/api/admin/payment-verifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: reviewStatus, reviewNote }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "Unable to review payment");
    toast.success(`Payment ${reviewStatus.toLowerCase()}`);
    await load();
  };

  const updatePlan = async (id: string, data: { isActive?: boolean; isDefault?: boolean }) => {
    const response = await fetch(`/api/admin/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "Unable to update plan");
    toast.success("Plan updated");
    await load();
  };

  const saveOverride = async () => {
    if (!ownerId) return toast.error("Choose an owner first");
    if (overrideReason.trim().length < 3) return toast.error("Add an audit reason");
    if (overrideLimit && !/^\d+$/.test(overrideLimit)) return toast.error("Limit must be a non-negative whole number");
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/entitlement-overrides/${ownerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: overrideFeature,
          enabled: overrideEnabled === "true",
          limit: overrideLimit || null,
          reason: overrideReason,
          expiresAt: overrideExpiresAt ? new Date(overrideExpiresAt).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save entitlement override");
      toast.success("Entitlement override saved and audited");
      setOverrideReason("");
      await loadOverrides(ownerId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save entitlement override");
    } finally {
      setBusy(false);
    }
  };

  const deleteOverride = async (feature: string) => {
    if (!ownerId || overrideReason.trim().length < 3) return toast.error("Add an audit reason before deleting an override");
    setBusy(true);
    try {
      const query = new URLSearchParams({ feature, reason: overrideReason });
      const response = await fetch(`/api/admin/entitlement-overrides/${ownerId}?${query}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to delete entitlement override");
      toast.success("Entitlement override removed");
      setOverrideReason("");
      await loadOverrides(ownerId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete entitlement override");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600">Superadmin control plane</p><h1 className="text-3xl font-bold tracking-tight">Commercial Operations</h1><p className="text-muted-foreground">Plans, tenant subscriptions, and manual payment verification.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-amber-500/20  from-amber-500/10 via-background "><CardHeader><CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-5 w-5 text-amber-600" />Create plan</CardTitle><CardDescription>Entitlements are stored as data, never inferred from the plan name.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Code</Label><Input value={planForm.code} onChange={(event) => setPlanForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="BUSINESS" /></div><div><Label>Name</Label><Input value={planForm.name} onChange={(event) => setPlanForm((current) => ({ ...current, name: event.target.value }))} /></div><div><Label>Monthly price</Label><Input inputMode="decimal" value={planForm.priceMonthly} onChange={(event) => setPlanForm((current) => ({ ...current, priceMonthly: event.target.value }))} /></div><div><Label>Trial days</Label><Input type="number" min="0" max="365" value={planForm.trialDays} onChange={(event) => setPlanForm((current) => ({ ...current, trialDays: event.target.value }))} /></div></div><div className="grid gap-2 sm:grid-cols-2">{features.map((feature) => <label key={feature} className="text-xs font-medium">{feature}<Input className="mt-1" inputMode="numeric" value={limits[feature]} onChange={(event) => setLimits((current) => ({ ...current, [feature]: event.target.value }))} /></label>)}</div><Button className="w-full" disabled={busy || planForm.code.length < 2 || planForm.name.length < 2} onClick={() => void createPlan()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create active plan</Button></CardContent></Card>

        <Card><CardHeader><CardTitle>Assign subscription</CardTitle><CardDescription>Upgrade and downgrade preserve devices, messages, media, and tenant data.</CardDescription></CardHeader><CardContent className="space-y-4"><div><Label>Owner</Label><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger><SelectValue placeholder="Choose owner" /></SelectTrigger><SelectContent>{owners.map((owner) => <SelectItem key={owner.id} value={owner.id}>{owner.email} ({owner.subscription?.plan.name ?? "no plan"})</SelectItem>)}</SelectContent></Select></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Plan</Label><Select value={planId} onValueChange={setPlanId}><SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger><SelectContent>{plans.filter((plan) => plan.isActive).map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TRIAL", "ACTIVE", "GRACE_PERIOD", "EXPIRED", "SUSPENDED", "CANCELLED"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div><Label>Ends at</Label><Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div><div><Label>Grace ends at</Label><Input type="datetime-local" value={graceEndsAt} onChange={(event) => setGraceEndsAt(event.target.value)} /></div></div><div><Label>Audit reason</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /></div><Button className="w-full" disabled={busy || reason.trim().length < 3} onClick={() => void updateSubscription()}><ShieldCheck className="mr-2 h-4 w-4" />Apply subscription</Button></CardContent></Card>
      </div>

      <Card className="border-[var(--pp-line)]  bg-[var(--pp-mint)] via-background to-amber-500/5">
        <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-[var(--pp-ink)]" />Tenant entitlement override</CardTitle><CardDescription>Temporary exceptions take precedence over the plan, expire automatically, and always require an audit reason.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div><Label>Feature</Label><Select value={overrideFeature} onValueChange={(value) => setOverrideFeature(value as (typeof features)[number])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{features.map((feature) => <SelectItem key={feature} value={feature}>{feature}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Access</Label><Select value={overrideEnabled} onValueChange={setOverrideEnabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Enabled</SelectItem><SelectItem value="false">Disabled</SelectItem></SelectContent></Select></div>
            <div><Label>Limit</Label><Input inputMode="numeric" value={overrideLimit} onChange={(event) => setOverrideLimit(event.target.value)} placeholder="Empty = unlimited" /></div>
            <div><Label>Expires at</Label><Input type="datetime-local" value={overrideExpiresAt} onChange={(event) => setOverrideExpiresAt(event.target.value)} /></div>
            <div><Label>Audit reason</Label><Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} maxLength={1000} placeholder="Required" /></div>
          </div>
          <Button disabled={busy || !ownerId || overrideReason.trim().length < 3} onClick={() => void saveOverride()}><ShieldCheck className="mr-2 h-4 w-4" />Save override</Button>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overrides.length === 0 && <p className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Choose an owner or no overrides are configured.</p>}
            {overrides.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border bg-background/80 p-4"><div><div className="flex items-center gap-2"><p className="font-semibold">{item.feature}</p><Badge variant={item.enabled ? "outline" : "secondary"}>{item.enabled ? "ENABLED" : "DISABLED"}</Badge></div><p className="text-xs text-muted-foreground">Limit: {item.limitValue ?? "unlimited"} · Expires: {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "never"}</p><p className="mt-1 text-xs">{item.reason}</p></div><Button size="icon" variant="ghost" disabled={busy} aria-label={`Delete ${item.feature} override`} onClick={() => void deleteOverride(item.feature)}><Trash2 className="h-4 w-4" /></Button></div>)}
          </div>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Plans</CardTitle><CardDescription>{plans.length} configured commercial packages.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => <div key={plan.id} className="rounded-xl border p-4"><div className="flex items-center justify-between"><p className="font-semibold">{plan.name}</p><Badge variant={plan.isActive ? "outline" : "secondary"}>{plan.isDefault ? "DEFAULT" : plan.isActive ? "ACTIVE" : "INACTIVE"}</Badge></div><p className="text-sm text-muted-foreground">{plan.code} · {plan.priceMonthly ?? "0"} {plan.currency}/month</p><p className="mt-2 text-xs text-muted-foreground">{plan.entitlements.length} entitlements · {plan.trialDays} trial days</p><div className="mt-3 flex gap-2">{!plan.isActive && <Button size="sm" variant="outline" onClick={() => void updatePlan(plan.id, { isActive: true })}>Activate</Button>}{plan.isActive && !plan.isDefault && <Button size="sm" variant="outline" onClick={() => void updatePlan(plan.id, { isDefault: true })}>Make default</Button>}</div></div>)}</CardContent></Card>

      <Card><CardHeader><CardTitle>Payment verification</CardTitle><CardDescription>Approval verifies the proof only. Subscription assignment remains an explicit audited action.</CardDescription></CardHeader><CardContent className="space-y-3">{payments.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No payment submissions.</p>}{payments.map((payment) => <div key={payment.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><p className="font-semibold">{payment.user.email}</p><Badge variant={payment.status === "PENDING" ? "outline" : "secondary"}>{payment.status}</Badge></div><p className="text-sm">{payment.amount} {payment.currency} · {payment.plan?.name ?? "Unknown plan"} · {payment.reference}</p>{payment.proofUrl && <a className="text-sm text-[var(--pp-ink)] underline" href={payment.proofUrl} target="_blank" rel="noreferrer">Open proof</a>}</div>{payment.status === "PENDING" && <div className="flex min-w-0 flex-1 gap-2 lg:max-w-xl"><Input value={reviewNotes[payment.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [payment.id]: event.target.value }))} placeholder="Required review note" /><Button onClick={() => void reviewPayment(payment.id, "APPROVED")}>Approve</Button><Button variant="destructive" onClick={() => void reviewPayment(payment.id, "REJECTED")}>Reject</Button></div>}</div></div>)}</CardContent></Card>
    </div>
  );
}
