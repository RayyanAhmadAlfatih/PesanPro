"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorScreen, LoadingScreen, MetricCard, MiniStat, PRESETS, REVENUE_VIEWS, SeriesChart } from "@/components/dashboard/superadmin/shared";
import { useSuperadminOverview } from "@/components/dashboard/superadmin/use-overview";
import { formatRupiah } from "@/lib/promo-pricing";
import type { Preset, RevenueView } from "@/components/dashboard/superadmin/types";

export default function SuperadminPemasukanPage() {
  const { data, loading, preset, from, to, setFrom, setTo, load, applyPreset } = useSuperadminOverview();
  const [viewMode, setViewMode] = useState<RevenueView>("APPROVED");

  const maxDaily = useMemo(() => Math.max(1, ...(data?.revenue.dailySeries.map((item) => item.amount) ?? [0])), [data]);
  const maxMonthly = useMemo(() => Math.max(1, ...(data?.revenue.monthlySeries.map((item) => item.amount) ?? [0])), [data]);
  const headline = data
    ? viewMode === "APPROVED"
      ? { label: "Pemasukan disetujui", value: data.revenue.gross, note: `${data.revenue.paymentCount} pembayaran · ${data.revenue.period.label}` }
      : viewMode === "ALL"
        ? { label: "Semua yang masuk", value: data.revenue.allIncomingTotal, note: `Termasuk ${data.revenue.pendingCount} PENDING · ${data.revenue.period.label}` }
        : { label: "Pemasukan bersih", value: data.revenue.net, note: `Disetujui dikurangi biaya VPS ${formatRupiah(data.revenue.infraCost)}` }
    : null;

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
          <h1 className="text-3xl font-bold tracking-tight">Pemasukan</h1>
          <p className="text-sm text-[var(--pp-muted)]">Laporan pemasukan per periode, per paket, dan grafik harian/bulanan.</p>
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

      <MetricCard label={headline?.label ?? "Pemasukan"} value={formatRupiah(headline?.value ?? 0)} note={headline?.note ?? ""} icon={<Wallet className="h-5 w-5" />} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Rincian pemasukan</CardTitle>
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
    </div>
  );
}
