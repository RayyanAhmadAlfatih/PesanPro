"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/promo-pricing";
import { toLocalInput } from "./shared";
import type { Plan, Promo } from "./types";

export function PromoEditor({ promo, plans, onClose, onSaved }: { promo: Promo | null; plans: Plan[]; onClose: () => void; onSaved: () => Promise<void> }) {
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
