"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorScreen, formatDate, LoadingScreen } from "@/components/dashboard/superadmin/shared";
import { useSuperadminOverview } from "@/components/dashboard/superadmin/use-overview";
import { formatRupiah } from "@/lib/promo-pricing";
import type { Plan } from "@/components/dashboard/superadmin/types";

export default function SuperadminHargaPage() {
  const { data, loading, load } = useSuperadminOverview();
  const [busy, setBusy] = useState(false);
  const [planPrices, setPlanPrices] = useState<Record<string, { monthly: string; yearly: string }>>({});

  // Form mengikuti data terbaru setiap kali overview dimuat ulang (sama seperti perilaku sebelumnya).
  useEffect(() => {
    if (!data) return;
    setPlanPrices(Object.fromEntries(data.plans.map((plan) => [
      plan.id,
      { monthly: plan.priceMonthly ?? "", yearly: plan.priceYearly ?? "" },
    ])));
  }, [data]);

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

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
        <h1 className="text-3xl font-bold tracking-tight">Harga Paket</h1>
        <p className="text-sm text-[var(--pp-muted)]">Ubah harga bulanan/tahunan tiap paket; semua perubahan tercatat di riwayat.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-5 w-5" />Daftar harga</CardTitle>
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
              <Button className="mt-3 w-full" variant="outline" disabled={busy} onClick={() => void savePlanPrice(plan)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Simpan harga</Button>
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
    </div>
  );
}
