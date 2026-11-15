"use client";

import {
  BadgeDollarSign,
  ChevronRight,
  CreditCard,
  Loader2,
  Megaphone,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorScreen, LoadingScreen, MetricCard, PRESETS, statusTone } from "@/components/dashboard/superadmin/shared";
import { useSuperadminOverview } from "@/components/dashboard/superadmin/use-overview";
import { formatRupiah } from "@/lib/promo-pricing";
import type { Preset } from "@/components/dashboard/superadmin/types";

const QUICK_LINKS = [
  { href: "/dashboard/superadmin/pemasukan", label: "Pemasukan", icon: Wallet, description: "Laporan pemasukan per periode, per paket, dan grafiknya." },
  { href: "/dashboard/superadmin/promo", label: "Promo & Voucher", icon: Megaphone, description: "Buat, ubah, nyalakan, dan hapus promo atau voucher." },
  { href: "/dashboard/superadmin/vps", label: "VPS & Kapasitas", icon: Server, description: "Kesehatan server, kapasitas tersisa, dan batas sumber daya." },
  { href: "/dashboard/superadmin/pembayaran", label: "Verifikasi Pembayaran", icon: CreditCard, description: "Setujui atau tolak pembayaran transfer manual." },
  { href: "/dashboard/superadmin/harga", label: "Harga Paket", icon: BadgeDollarSign, description: "Ubah harga paket; perubahan tercatat di riwayat." },
] as const;

export default function SuperadminRingkasanPage() {
  const { data, loading, preset, from, to, setFrom, setTo, load, applyPreset } = useSuperadminOverview();

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  const capacity = data.capacity.report;
  const activePromos = data.promos.filter((promo) => promo.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
          <h1 className="text-3xl font-bold tracking-tight">Ringkasan</h1>
          <p className="text-sm text-[var(--pp-muted)]">Gambaran singkat operasional. Setiap fitur punya sub-menu sendiri di atas.</p>
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
        <MetricCard label="Pemasukan disetujui" value={formatRupiah(data.revenue.gross)} note={`${data.revenue.paymentCount} pembayaran · ${data.revenue.period.label}`} icon={<Wallet className="h-5 w-5" />} />
        <MetricCard label="Sebelum promo" value={formatRupiah(data.revenue.beforeDiscount)} note={`Total promo diberikan ${formatRupiah(data.revenue.discountTotal)}`} icon={<BadgeDollarSign className="h-5 w-5" />} />
        <MetricCard label="Pemasukan bersih" value={formatRupiah(data.revenue.net)} note={`Biaya VPS ${formatRupiah(data.revenue.infraCost)}`} icon={<Server className="h-5 w-5" />} />
        <MetricCard label="Tenant berbayar" value={String(capacity.tenants)} note={`${data.business.devices.connected}/${data.business.devices.total} sesi WA terhubung`} icon={<Users className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="group rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-5 transition-colors hover:border-[var(--pp-ink)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <link.icon className="h-5 w-5 text-[var(--pp-muted)] group-hover:text-[var(--pp-ink)]" />
                <p className="font-semibold">{link.label}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--pp-muted)] transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-sm text-[var(--pp-muted)]">{link.description}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className={statusTone(capacity.statusLevel)}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Status kapasitas</CardTitle>
            <CardDescription>Perkiraan dari bound paling sempit. Detail dan pengaturan di sub-menu VPS & Kapasitas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline">
              {capacity.remainingTenants === null
                ? "Kapasitas belum bisa dihitung"
                : `Kira-kira masih muat ${capacity.remainingTenants} tenant lagi`} · {capacity.statusPercent}% terpakai
            </Badge>
            <p className="text-xs text-[var(--pp-muted)]">
              {capacity.note} Bagian paling penuh: {capacity.fullestResource ?? "belum diketahui"}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Pekerjaan menunggu</CardTitle>
            <CardDescription>Hal yang perlu ditindak di sub-menu masing-masing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-semibold tabular-nums">{data.pendingPayments.length}</span> pembayaran menunggu verifikasi ·{" "}
              <Link className="underline underline-offset-4" href="/dashboard/superadmin/pembayaran">buka verifikasi</Link>
            </p>
            <p>
              <span className="font-semibold tabular-nums">{data.promos.length}</span> promo terdaftar ({activePromos} aktif) ·{" "}
              <Link className="underline underline-offset-4" href="/dashboard/superadmin/promo">kelola promo</Link>
            </p>
            <p>
              <span className="font-semibold tabular-nums">{data.vps.queues.reduce((total, queue) => total + queue.pending, 0)}</span> pesan menunggu di antrean ·{" "}
              <Link className="underline underline-offset-4" href="/dashboard/superadmin/vps">lihat VPS</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
