"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  MemoryStick,
  Server,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorScreen, formatBytes, formatGb, HealthRow, LoadingScreen, statusTone } from "@/components/dashboard/superadmin/shared";
import { useSuperadminOverview } from "@/components/dashboard/superadmin/use-overview";
import { cn } from "@/lib/utils";

export default function SuperadminVpsPage() {
  const { data, loading, load } = useSuperadminOverview();
  const [busy, setBusy] = useState(false);
  const [vpsCost, setVpsCost] = useState("");
  const [capacityForm, setCapacityForm] = useState({ cpuCores: "", ramGb: "", diskGb: "", waSessions: "", monthlyMessages: "" });

  // Form mengikuti data terbaru setiap kali overview dimuat ulang (sama seperti perilaku sebelumnya).
  useEffect(() => {
    if (!data) return;
    setVpsCost(data.capacity.vpsMonthlyCostIdr);
    setCapacityForm({
      cpuCores: String(data.capacity.limits.cpuCores ?? ""),
      ramGb: data.capacity.limits.ramBytes ? formatGb(data.capacity.limits.ramBytes) : "",
      diskGb: data.capacity.limits.diskBytes ? formatGb(data.capacity.limits.diskBytes) : "",
      waSessions: String(data.capacity.limits.waSessions ?? ""),
      monthlyMessages: data.capacity.limits.monthlyMessages ?? "",
    });
  }, [data]);

  const saveSettings = async () => {
    const ramGb = Number(capacityForm.ramGb);
    const diskGb = Number(capacityForm.diskGb);
    if (!vpsCost.trim() || !/^\d+(\.\d{1,2})?$/.test(vpsCost.trim())) return toast.error("Biaya VPS harus angka.");
    if (!Number.isInteger(Number(capacityForm.cpuCores)) || Number(capacityForm.cpuCores) <= 0) return toast.error("Core CPU harus angka bulat lebih dari 0.");
    if (!Number.isFinite(ramGb) || ramGb <= 0) return toast.error("RAM GB harus angka lebih dari 0.");
    if (!Number.isFinite(diskGb) || diskGb <= 0) return toast.error("Disk GB harus angka lebih dari 0.");
    // Batas sesi WA dan pesan tidak punya angka bawaan. Kosong = belum diisi,
    // dan kapasitas untuk bound itu ditampilkan sebagai "belum bisa dihitung".
    const waSessions = capacityForm.waSessions.trim() === "" ? null : Number(capacityForm.waSessions);
    if (waSessions !== null && (!Number.isInteger(waSessions) || waSessions <= 0)) return toast.error("Batas sesi WhatsApp harus angka bulat lebih dari 0, atau dikosongkan.");
    const monthlyMessages = capacityForm.monthlyMessages.trim() === "" ? null : capacityForm.monthlyMessages.trim();
    if (monthlyMessages !== null && !/^\d+$/.test(monthlyMessages)) return toast.error("Batas pesan bulanan harus angka bulat, atau dikosongkan.");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/superadmin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vpsMonthlyCostIdr: vpsCost.trim(),
          capacityLimits: {
            cpuCores: Number(capacityForm.cpuCores),
            ramBytes: String(Math.round(ramGb * 1024 ** 3)),
            diskBytes: String(Math.round(diskGb * 1024 ** 3)),
            waSessions,
            monthlyMessages,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Pengaturan gagal disimpan.");
      toast.success("Biaya VPS dan batas kapasitas tersimpan.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengaturan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <LoadingScreen />;
  if (!data) return <ErrorScreen onRetry={() => void load()} />;

  const capacity = data.capacity.report;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--pp-muted)]">SuperAdmin</p>
        <h1 className="text-3xl font-bold tracking-tight">VPS & Kapasitas</h1>
        <p className="text-sm text-[var(--pp-muted)]">Kesehatan server, kapasitas tersisa, dan batas sumber daya.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Kesehatan VPS</CardTitle>
          <CardDescription>Uptime proses {Math.floor(data.vps.uptimeSeconds / 3600)} jam · DB {data.vps.database.ok ? `${data.vps.database.latencyMs} ms` : "tidak tersedia"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <HealthRow icon={<Cpu className="h-4 w-4" />} label="CPU" value={`${data.vps.resources.cpuPercent.toFixed(1)}%`} percent={data.vps.resources.cpuPercent} />
          <HealthRow icon={<MemoryStick className="h-4 w-4" />} label="RAM" value={`${formatBytes(data.vps.resources.memory.usedBytes)} / ${formatBytes(data.vps.resources.memory.totalBytes)}`} percent={data.vps.resources.memory.usePercent} />
          <HealthRow icon={<HardDrive className="h-4 w-4" />} label="Disk" value={`${formatBytes(data.vps.resources.disks[0]?.usedBytes)} / ${formatBytes(data.vps.resources.disks[0]?.sizeBytes)}`} percent={data.vps.resources.disks[0]?.usePercent ?? 0} />
          <HealthRow icon={<Database className="h-4 w-4" />} label="Database" value={data.vps.database.ok ? "Terhubung" : "Gagal"} percent={data.vps.database.ok ? 100 : 0} tone={data.vps.database.ok ? "ok" : "critical"} />
          <HealthRow icon={<HardDrive className="h-4 w-4" />} label="Penyimpanan" value={data.vps.storage.ok ? `Aktif · ${formatBytes(data.vps.storage.freeBytes)} bebas` : "Gagal"} percent={data.vps.storage.ok ? 100 : 0} tone={data.vps.storage.ok ? "ok" : "critical"} />
          <p className="text-xs text-[var(--pp-muted)]">
            Sesi WhatsApp {data.business.devices.connected}/{data.business.devices.total} terhubung · {data.vps.queues.reduce((total, queue) => total + queue.pending, 0)} pesan menunggu di antrean.
          </p>
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            {data.vps.processes.map((process) => (
              <div key={process.processType} className="flex items-center justify-between rounded-md border border-[var(--pp-line)] px-3 py-2 text-xs">
                <span>{process.processType}</span>
                <Badge variant={process.ok ? "outline" : "secondary"}>{process.ok ? "OK" : "STALE"}</Badge>
              </div>
            ))}
          </div>
          {data.vps.alerts.length > 0 ? (
            <div className="space-y-2">
              {data.vps.alerts.slice(0, 4).map((alert) => (
                <div key={alert.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{alert.title}</p>
                  <p className="mt-1">{alert.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className={cn("border", statusTone(capacity.statusLevel))}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Kapasitas tersisa</CardTitle>
              <CardDescription>Perkiraan dari bound paling sempit. Batas bisa diubah di bawah.</CardDescription>
            </div>
            <Badge variant="outline">
              {capacity.remainingTenants === null
                ? "Kapasitas belum bisa dihitung"
                : `Kira-kira masih muat ${capacity.remainingTenants} tenant lagi`} · {capacity.statusPercent}% terpakai
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {capacity.bounds.map((bound) => (
              <div key={bound.key} className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-white)] p-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{bound.label}</span>
                  <span>{bound.usePercent.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pp-paper)]">
                  <div className={cn("h-full", bound.usePercent > 90 ? "bg-red-500" : bound.usePercent >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, bound.usePercent)}%` }} />
                </div>
                <p className="mt-2 text-xs text-[var(--pp-muted)]">
                  {bound.key === "RAM" || bound.key === "DISK"
                    ? `${formatBytes(bound.usage)} / ${formatBytes(bound.limit)}`
                    : `${Math.round(bound.usage).toLocaleString("id-ID")} / ${Math.round(bound.limit).toLocaleString("id-ID")}`}
                </p>
                <p className="mt-1 font-medium">{bound.available ? `Kira-kira ${bound.remainingTenants ?? 0} tenant lagi` : "Belum bisa dihitung"}</p>
                <p className="mt-1 text-[11px] text-[var(--pp-muted)]">
                  Rata-rata/tenant: {bound.key === "RAM" || bound.key === "DISK"
                    ? formatBytes(bound.avgPerTenant)
                    : Math.round(bound.avgPerTenant).toLocaleString("id-ID")}
                </p>
                {bound.reason ? <p className="mt-1 text-[11px] text-[var(--pp-muted)]">{bound.reason}</p> : null}
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--pp-muted)]">
            {capacity.note} Sumber batas: {data.capacity.source === "saved" ? "tersimpan" : "pengukuran live"}. Bagian paling penuh: {capacity.fullestResource ?? "belum diketahui"}. Batas penentu: {capacity.fullest ?? "belum ada"}.
            {capacity.missingLimits.length > 0 ? ` Belum bisa dihitung: ${capacity.missingLimits.join(", ")}.` : ""}
          </p>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div><Label htmlFor="cap-cpu">Core CPU</Label><Input id="cap-cpu" inputMode="numeric" value={capacityForm.cpuCores} onChange={(event) => setCapacityForm((current) => ({ ...current, cpuCores: event.target.value }))} /></div>
            <div><Label htmlFor="cap-ram">RAM (GB)</Label><Input id="cap-ram" inputMode="decimal" value={capacityForm.ramGb} onChange={(event) => setCapacityForm((current) => ({ ...current, ramGb: event.target.value }))} /></div>
            <div><Label htmlFor="cap-disk">Disk (GB)</Label><Input id="cap-disk" inputMode="decimal" value={capacityForm.diskGb} onChange={(event) => setCapacityForm((current) => ({ ...current, diskGb: event.target.value }))} /></div>
            <div><Label htmlFor="cap-wa">Sesi WhatsApp</Label><Input id="cap-wa" inputMode="numeric" value={capacityForm.waSessions} onChange={(event) => setCapacityForm((current) => ({ ...current, waSessions: event.target.value }))} /></div>
            <div><Label htmlFor="cap-msg">Pesan / bulan</Label><Input id="cap-msg" inputMode="numeric" value={capacityForm.monthlyMessages} onChange={(event) => setCapacityForm((current) => ({ ...current, monthlyMessages: event.target.value }))} /></div>
            <div><Label htmlFor="cap-vps">Biaya VPS (Rp)</Label><Input id="cap-vps" inputMode="decimal" value={vpsCost} onChange={(event) => setVpsCost(event.target.value)} /></div>
          </div>
          <Button disabled={busy} onClick={() => void saveSettings()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Simpan batas & biaya</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Antrean & bisnis</CardTitle><CardDescription>Aktivitas pengiriman dan penggunaan media.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.vps.queues.map((queue) => (
            <div key={queue.name} className="rounded-lg border border-[var(--pp-line)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">{queue.name}</p>
              <p className="mt-1 text-sm">{queue.pending} menunggu · {queue.processing} proses</p>
              <p className={cn("text-xs", queue.failed > 0 ? "font-semibold text-red-600" : "text-[var(--pp-muted)]")}>{queue.failed} gagal</p>
            </div>
          ))}
          <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
            <p className="text-xs text-[var(--pp-muted)]">Pesan bulan ini</p>
            <p className="mt-1 font-semibold tabular-nums">{data.business.sentMessages.toLocaleString("id-ID")}</p>
          </div>
          <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
            <p className="text-xs text-[var(--pp-muted)]">Media tersimpan</p>
            <p className="mt-1 font-semibold tabular-nums">{formatBytes(data.business.storageBytes)}</p>
          </div>
          <div className="rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-3">
            <p className="text-xs text-[var(--pp-muted)]">Proses server</p>
            <p className="mt-1 flex items-center gap-1 font-semibold"><Server className="h-4 w-4" />{data.vps.processes.length} proses</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
