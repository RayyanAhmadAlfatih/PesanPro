"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCommercialFeatureVisible } from "@/lib/access-policy";

const scopes = [
  "device:read", "device:write", "message:read", "message:send", "media:read",
  "media:write", "schedule:read", "schedule:write", "broadcast:read", "broadcast:write", "campaign:read", "campaign:write", "autoreply:read", "autoreply:write", "webhook:read", "webhook:write",
] as const;

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
  priceMonthly: string | null;
  currency: string;
}

interface PaymentSubmission {
  id: string;
  amount: string;
  currency: string;
  reference: string | null;
  proofUrl: string | null;
  status: string;
  createdAt: string;
  plan: { code: string; name: string } | null;
}

interface ApiKeyItem {
  id: string;
  name: string;
  preview: string;
  scopes: string[];
  ipAllowlist: string[] | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [plans, setPlans] = useState<AvailablePlan[]>([]);
  const [payments, setPayments] = useState<PaymentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("Production API");
  const [expiresAt, setExpiresAt] = useState("");
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([...scopes]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [paymentPlanId, setPaymentPlanId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofUrl, setPaymentProofUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [billingResponse, keyResponse, planResponse, paymentResponse] = await Promise.all([
        fetch("/api/billing/summary"),
        fetch("/api/user/api-keys"),
        fetch("/api/plans"),
        fetch("/api/payment-verifications"),
      ]);
      if (!billingResponse.ok) throw new Error("Unable to load billing information");
      const billingBody = await billingResponse.json();
      const summary = billingBody.data as BillingSummary | null;
      setBilling(summary ? {
        ...summary,
        entitlements: summary.entitlements.filter((item) => isCommercialFeatureVisible(item.feature)),
        usage: summary.usage.filter((item) => isCommercialFeatureVisible(item.feature)),
      } : null);
      if (keyResponse.ok) {
        const keyBody = await keyResponse.json();
        setKeys(keyBody.data ?? []);
      }
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

  const createKey = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: selectedScopes,
          ipAllowlist: ipAllowlist.split(",").map((item) => item.trim()).filter(Boolean),
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create API key");
      setNewSecret(body.data.secret);
      setKeys((current) => [{ ...body.data, revokedAt: null, lastUsedAt: null }, ...current]);
      toast.success("API key created. Store the secret now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create API key");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this API key? Integrations using it will stop immediately.")) return;
    const response = await fetch(`/api/user/api-keys/${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Unable to revoke API key");
    setKeys((current) => current.map((key) => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key));
    toast.success("API key revoked");
  };

  const rotate = async (id: string) => {
    if (!window.confirm("Rotate this API key? The previous secret will stop working immediately.")) return;
    const response = await fetch(`/api/user/api-keys/${id}/rotate`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "Unable to rotate API key");
    setNewSecret(body.data.secret);
    await load();
    toast.success("API key rotated. The previous key is no longer valid.");
  };

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
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-ink)]">Commercial controls</p>
          <h1 className="text-3xl font-bold tracking-tight">Billing & API Keys</h1>
          <p className="text-muted-foreground">Monitor plan limits and control developer credentials.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="overflow-hidden border-[var(--pp-line)]  bg-[var(--pp-mint)] via-background to-lime-500/5">
          <CardHeader>
            <div className="flex items-center justify-between"><CreditCard className="h-7 w-7 text-[var(--pp-ink)]" /><Badge>{billing?.status ?? "UNKNOWN"}</Badge></div>
            <CardTitle className="text-2xl">{billing?.plan.name ?? "No plan"}</CardTitle>
            <CardDescription>Plan code: {billing?.plan.code ?? "-"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{billing?.plan.unlimited ? "Commercial usage is unlimited; safety limits still apply." : "Usage is enforced atomically for this tenant."}</p>
            {billing?.trialEndsAt && <p className="text-muted-foreground">Trial ends {new Date(billing.trialEndsAt).toLocaleString()}</p>}
            {billing?.graceEndsAt && <p className="text-amber-600">Grace period ends {new Date(billing.graceEndsAt).toLocaleString()}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Entitlements & usage</CardTitle><CardDescription>Current subscription period, sourced from the server.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {billing?.entitlements.map((item) => {
              const usage = usageMap.get(item.feature);
              return (
                <div key={item.feature} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold tracking-wide">{item.feature}</span><ShieldCheck className={`h-4 w-4 ${item.enabled ? "text-[var(--pp-ink)]" : "text-muted-foreground"}`} /></div>
                  <p className="mt-2 text-lg font-semibold">{usage?.consumed ?? "0"} <span className="text-xs font-normal text-muted-foreground">/ {item.limit ?? "unlimited"}</span></p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {newSecret && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardHeader><CardTitle>Store this secret now</CardTitle><CardDescription>It will not be displayed again after this page is closed.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row"><Input value={newSecret} readOnly className="font-mono" /><Button onClick={() => void navigator.clipboard.writeText(newSecret).then(() => toast.success("Secret copied")).catch(() => toast.error("Unable to copy secret"))}>Copy secret</Button><Button variant="ghost" onClick={() => setNewSecret(null)}>Hide</Button></CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader><CardTitle>Create API key</CardTitle><CardDescription>Choose the minimum permissions required by the integration.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="key-name">Name</Label><Input id="key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={64} /></div>
            <div className="space-y-2"><Label htmlFor="key-expiry">Expiry date (optional)</Label><Input id="key-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="key-ips">Allowed IPs (optional)</Label><Input id="key-ips" value={ipAllowlist} onChange={(event) => setIpAllowlist(event.target.value)} placeholder="203.0.113.10, 2001:db8::10" /><p className="text-xs text-muted-foreground">Comma-separated exact addresses. Leave empty to allow any IP.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopes.map((scope) => <label key={scope} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={selectedScopes.includes(scope)} onChange={(event) => setSelectedScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />{scope}</label>)}
            </div>
            <Button className="w-full" disabled={submitting || selectedScopes.length === 0 || name.trim().length < 2} onClick={() => void createKey()}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Create key</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Developer credentials</CardTitle><CardDescription>Revoked and expired keys remain visible for audit.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {keys.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No API keys yet.</p>}
            {keys.map((key) => <div key={key.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-semibold">{key.name}</p><Badge variant={key.revokedAt ? "secondary" : "outline"}>{key.revokedAt ? "REVOKED" : "ACTIVE"}</Badge></div><p className="font-mono text-xs text-muted-foreground">{key.preview}</p><p className="mt-1 text-xs text-muted-foreground">{key.scopes.join(", ")}</p>{key.ipAllowlist && key.ipAllowlist.length > 0 && <p className="mt-1 text-xs text-muted-foreground">IPs: {key.ipAllowlist.join(", ")}</p>}</div>{!key.revokedAt && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void rotate(key.id)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Rotate</Button><Button size="sm" variant="destructive" onClick={() => void revoke(key.id)}><Trash2 className="mr-2 h-3.5 w-3.5" />Revoke</Button></div>}</div></div>)}
          </CardContent>
        </Card>
      </div>

      {billing?.role === "USER" && <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><Card><CardHeader><CardTitle>Submit payment proof</CardTitle><CardDescription>Manual verification does not activate a plan automatically.</CardDescription></CardHeader><CardContent className="space-y-3"><div><Label htmlFor="payment-plan">Plan</Label><select id="payment-plan" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentPlanId} onChange={(event) => { const selected = plans.find((plan) => plan.id === event.target.value); setPaymentPlanId(event.target.value); setPaymentAmount(selected?.priceMonthly ?? ""); }}><option value="">Choose plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.priceMonthly ?? "0"} {plan.currency}</option>)}</select></div><div><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></div><div><Label htmlFor="payment-reference">Payment reference</Label><Input id="payment-reference" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={120} /></div><div><Label htmlFor="payment-proof">HTTPS proof URL</Label><Input id="payment-proof" type="url" value={paymentProofUrl} onChange={(event) => setPaymentProofUrl(event.target.value)} placeholder="https://..." /></div><Button className="w-full" disabled={submitting || !paymentPlanId || paymentReference.trim().length < 3 || !paymentProofUrl.startsWith("https://")} onClick={() => void submitPayment()}>Submit for verification</Button></CardContent></Card><Card><CardHeader><CardTitle>Payment history</CardTitle><CardDescription>Review status and verifier notes remain available for audit.</CardDescription></CardHeader><CardContent className="space-y-3">{payments.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No payment proof submitted.</p>}{payments.map((payment) => <div key={payment.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{payment.plan?.name ?? "Plan"}</p><Badge variant={payment.status === "PENDING" ? "outline" : "secondary"}>{payment.status}</Badge></div><p className="text-sm text-muted-foreground">{payment.amount} {payment.currency} · {payment.reference}</p><p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</p></div>)}</CardContent></Card></div>}
    </div>
  );
}
