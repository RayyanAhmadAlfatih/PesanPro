"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/promo-pricing";
import { cn } from "@/lib/utils";
import type { Preset, RevenueView } from "./types";

export const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "THIS_WEEK", label: "Minggu ini" },
  { value: "THIS_MONTH", label: "Bulan ini" },
  { value: "LAST_30_DAYS", label: "30 hari terakhir" },
  { value: "ALL_TIME", label: "Semua waktu sejak awal" },
  { value: "TODAY", label: "Hari ini" },
  { value: "7D", label: "7 hari terakhir" },
  { value: "LAST_MONTH", label: "Bulan lalu" },
  { value: "CUSTOM", label: "Pilih tanggal" },
];

export const REVENUE_VIEWS: Array<{ value: RevenueView; label: string }> = [
  { value: "APPROVED", label: "Hanya yang sudah disetujui" },
  { value: "ALL", label: "Semua yang masuk (termasuk PENDING)" },
  { value: "NET", label: "Disetujui dikurangi biaya VPS" },
];

export function SeriesChart({ points, max }: { points: Array<{ key: string; label: string; amount: number }>; max: number }) {
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

export function formatBytes(value: string | number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatGb(value: string | number | null | undefined) {
  return (Number(value ?? 0) / 1024 ** 3).toFixed(1);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function statusTone(level: string) {
  if (level === "critical") return "border-red-300 bg-red-50 text-red-700";
  if (level === "warning") return "border-amber-300 bg-amber-50 text-amber-800";
  if (level === "ok") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  return "border-[var(--pp-line)] bg-[var(--pp-paper)] text-[var(--pp-muted)]";
}

export function MetricCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) {
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

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
      <p className="text-xs text-[var(--pp-muted)]">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function LoadingScreen({ label = "Memuat SuperAdmin" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" aria-label={label} />
    </div>
  );
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div>
      <p className="font-semibold">Data SuperAdmin tidak bisa dimuat.</p>
      <Button className="mt-3" variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Coba lagi
      </Button>
    </div>
  );
}

export function HealthRow({ icon, label, value, percent, tone = "ok" }: { icon: ReactNode; label: string; value: string; percent: number; tone?: "ok" | "critical" }) {
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
