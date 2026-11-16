"use client";

import { useState } from "react";
import {
  Megaphone,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PromoEditor } from "@/components/dashboard/superadmin/promo-editor";
import { ErrorScreen, formatDate, LoadingScreen } from "@/components/dashboard/superadmin/shared";
import { useSuperadminOverview } from "@/components/dashboard/superadmin/use-overview";
import { formatRupiah } from "@/lib/promo-pricing";
import type { Promo } from "@/components/dashboard/superadmin/types";

export default function SuperadminPromoPage() {
  const { data, loading, load } = useSuperadminOverview();
  const [busy, setBusy] = useState(false);
  const [promoEditor, setPromoEditor] = useState<{ open: boolean; promo: Promo | null }>({ open: false, promo: null });

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

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
        <h1 className="text-3xl font-bold tracking-tight">Promo & Voucher</h1>
        <p className="text-sm text-[var(--pp-muted)]">Buat dan kelola promo pembelian pertama: persen, harga tetap, atau kode voucher.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />Daftar promo</CardTitle>
              <CardDescription>Promo hanya untuk pembelian pertama. Perpanjangan memakai harga normal yang terkunci.</CardDescription>
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
    </div>
  );
}
