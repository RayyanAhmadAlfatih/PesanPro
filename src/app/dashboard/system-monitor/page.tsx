"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, Database, HardDrive, RefreshCw, Server, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type Snapshot = {
  timestamp: string;
  database: { ok: boolean; latencyMs: number };
  storage: { ok: boolean; latencyMs: number; freeBytes?: string };
  processes: Array<{ processType: string; ok: boolean; heartbeat: null | { instanceId: string; hostname: string; heartbeatAt: string; status: string } }>;
  queues: Array<{ name: string; pending: number; processing: number; deadLetter: number; oldestPendingAgeMs: number | null }>;
  resources: { cpuPercent: number; memory: { totalBytes: string; usedBytes: string; usePercent: number }; disks: Array<{ mount: string; usePercent: number }> };
  business: {
    tenants: number;
    activeUsers: number;
    monthlyActiveTenants: number;
    sentMessages: number;
    apiRequests: string;
    devices: { total: number; connected: number };
    storageBytes: string;
    subscriptions: Record<string, number>;
    revenue: { currency: string; recurringEstimate: string; approvedPayments: string; estimatedNet: string; note: string };
  };
  alerts: Array<{ id: string; severity: "INFO" | "WARNING" | "CRITICAL"; status: string; title: string; message: string; occurrences: number; lastSeenAt: string }>;
};

type AuditItem = { id: string; action: string; resource: string; userEmail: string | null; createdAt: string };

function formatBytes(value: string | number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDuration(ms: number | null) {
  if (ms === null) return "no backlog";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatMoney(value: string, currency: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
}

export default function SystemMonitorPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAlert, setBusyAlert] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const [opsResponse, auditResponse] = await Promise.all([
        fetch("/api/admin/operations/overview", { cache: "no-store" }),
        fetch("/api/admin/audit-logs?limit=12", { cache: "no-store" }),
      ]);
      const [opsBody, auditBody] = await Promise.all([opsResponse.json(), auditResponse.json()]);
      if (!opsResponse.ok) throw new Error(opsBody.error ?? "Operational snapshot unavailable");
      setSnapshot(opsBody.data);
      if (auditResponse.ok) setAudits(auditBody.data);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Unable to load operations data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const updateAlert = async (id: string, action: "ACKNOWLEDGE" | "RESOLVE") => {
    setBusyAlert(id);
    try {
      const response = await fetch(`/api/admin/operations/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: `${action === "ACKNOWLEDGE" ? "Acknowledged" : "Resolved"} from operations dashboard` }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update alert");
      toast.success(action === "ACKNOWLEDGE" ? "Alert acknowledged" : "Alert resolved");
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update alert");
    } finally {
      setBusyAlert(null);
    }
  };

  if (loading && !snapshot) {
    return <div className="space-y-5 p-4 md:p-8">{[120, 180, 260].map((height) => <Skeleton key={height} className="w-full rounded-2xl" style={{ height }} />)}</div>;
  }

  if (!snapshot) return <div className="p-8 text-center text-muted-foreground">Operational snapshot is unavailable.</div>;
  const healthy = snapshot.database.ok && snapshot.storage.ok && snapshot.processes.every((item) => item.ok);
  const criticalAlerts = snapshot.alerts.filter((item) => item.severity === "CRITICAL").length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
      <section className="relative overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)] p-6 shadow-sm md:p-8">
        <div className="absolute -bottom-20 -right-16 h-56 w-56 rounded-full border-[28px] border-[var(--pp-line)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--pp-ink)]">Production control plane</p><h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-stone-950 md:text-5xl">Operations Command Center</h1><p className="mt-2 max-w-2xl text-sm text-stone-600">Runtime truth from MySQL, workers, queues, private storage, and the host. Updated every 15 seconds.</p></div>
          <div className="flex items-center gap-3"><Badge className={healthy ? "bg-[var(--pp-ink)]" : "bg-red-700"}>{healthy ? "READY" : "ATTENTION REQUIRED"}</Badge><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Readiness" value={healthy ? "Healthy" : "Degraded"} detail={`${snapshot.processes.filter((item) => item.ok).length}/${snapshot.processes.length} processes`} icon={healthy ? CheckCircle2 : XCircle} tone={healthy ? "emerald" : "red"} />
        <Metric title="Active tenants" value={snapshot.business.monthlyActiveTenants.toLocaleString("id-ID")} detail={`${snapshot.business.tenants} registered users`} icon={Users} tone="amber" />
        <Metric title="Messages this month" value={snapshot.business.sentMessages.toLocaleString("id-ID")} detail={`${snapshot.business.apiRequests} API requests`} icon={Activity} tone="blue" />
        <Metric title="Approved revenue" value={formatMoney(snapshot.business.revenue.approvedPayments, snapshot.business.revenue.currency)} detail={`MRR ${formatMoney(snapshot.business.revenue.recurringEstimate, snapshot.business.revenue.currency)}`} icon={CircleDollarSign} tone="emerald" />
        <Metric title="Open alerts" value={snapshot.alerts.length.toString()} detail={`${criticalAlerts} critical`} icon={AlertTriangle} tone={criticalAlerts ? "red" : "amber"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Runtime processes</CardTitle><CardDescription>A process becomes stale after the configured heartbeat window.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{snapshot.processes.map((item) => <div key={item.processType} className="rounded-2xl border bg-muted/15 p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{item.processType.replaceAll("_", " ")}</p><Badge variant={item.ok ? "outline" : "destructive"}>{item.ok ? item.heartbeat?.status ?? "HEALTHY" : "STALE"}</Badge></div><p className="mt-2 truncate text-xs text-muted-foreground">{item.heartbeat?.instanceId ?? "No heartbeat recorded"}</p><p className="mt-1 text-xs text-muted-foreground">{item.heartbeat ? `${item.heartbeat.hostname} · ${new Date(item.heartbeat.heartbeatAt).toLocaleTimeString("id-ID")}` : "Start the required process"}</p></div>)}</CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Host health</CardTitle><CardDescription>Dependency and capacity probes.</CardDescription></CardHeader><CardContent className="space-y-5"><HealthRow label="MySQL" value={`${snapshot.database.latencyMs} ms`} ok={snapshot.database.ok} /><HealthRow label="Private storage" value={`${snapshot.storage.latencyMs} ms · ${formatBytes(snapshot.storage.freeBytes ?? 0)} free`} ok={snapshot.storage.ok} /><ResourceBar label="CPU" value={snapshot.resources.cpuPercent} /><ResourceBar label="Memory" value={snapshot.resources.memory.usePercent} />{snapshot.resources.disks.map((disk) => <ResourceBar key={disk.mount} label={`Disk ${disk.mount}`} value={disk.usePercent} />)}</CardContent></Card>
      </section>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" />Durable queues</CardTitle><CardDescription>Oldest age reveals stalled work even when process counters look normal.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{snapshot.queues.map((queue) => <div key={queue.name} className="rounded-2xl border p-4"><div className="flex items-center justify-between"><p className="font-semibold capitalize">{queue.name}</p><Badge variant={queue.deadLetter ? "destructive" : "secondary"}>{queue.deadLetter ? `${queue.deadLetter} DLQ` : "clear"}</Badge></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><QueueStat label="Pending" value={queue.pending} /><QueueStat label="Active" value={queue.processing} /><QueueStat label="Oldest" value={formatDuration(queue.oldestPendingAgeMs)} /></div></div>)}</CardContent></Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Operational alerts</CardTitle><CardDescription>Deduplicated conditions with explicit operator acknowledgement.</CardDescription></CardHeader><CardContent className="space-y-3">{snapshot.alerts.length === 0 && <EmptyState text="No active operational alert." />}{snapshot.alerts.map((alert) => <div key={alert.id} className={`rounded-2xl border p-4 ${alert.severity === "CRITICAL" ? "border-red-300 bg-red-50/50" : "border-amber-300 bg-amber-50/50"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Badge variant={alert.severity === "CRITICAL" ? "destructive" : "outline"}>{alert.severity}</Badge><span className="text-xs text-muted-foreground">{alert.occurrences} occurrence(s)</span></div><p className="mt-2 font-semibold">{alert.title}</p><p className="mt-1 text-sm text-muted-foreground">{alert.message}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busyAlert === alert.id || alert.status === "ACKNOWLEDGED"} onClick={() => void updateAlert(alert.id, "ACKNOWLEDGE")}>Acknowledge</Button><Button size="sm" disabled={busyAlert === alert.id} onClick={() => void updateAlert(alert.id, "RESOLVE")}>Resolve</Button></div></div></div>)}</CardContent></Card>

        <Card><CardHeader><CardTitle>Recent audit trail</CardTitle><CardDescription>Newest privileged and security-relevant actions.</CardDescription></CardHeader><CardContent className="space-y-2">{audits.length === 0 && <EmptyState text="No audit record found." />}{audits.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.action}</p><p className="truncate text-xs text-muted-foreground">{item.userEmail ?? "system"} · {item.resource}</p></div><time className="shrink-0 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("id-ID")}</time></div>)}</CardContent></Card>
      </section>

      <Card className="border-stone-300 bg-stone-950 text-stone-50"><CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4"><BusinessStat label="Connected devices" value={`${snapshot.business.devices.connected}/${snapshot.business.devices.total}`} /><BusinessStat label="Active users" value={snapshot.business.activeUsers.toString()} /><BusinessStat label="Media storage" value={formatBytes(snapshot.business.storageBytes)} /><BusinessStat label="Estimated net" value={formatMoney(snapshot.business.revenue.estimatedNet, snapshot.business.revenue.currency)} /></CardContent></Card>
    </div>
  );
}

function Metric({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: typeof Activity; tone: "emerald" | "amber" | "blue" | "red" }) {
  const colors = { emerald: "bg-[var(--pp-mint)] text-[var(--pp-ink)]", amber: "bg-amber-50 text-amber-800", blue: "bg-sky-50 text-sky-800", red: "bg-red-50 text-red-800" };
  return <Card><CardContent className="p-5"><div className={`mb-4 inline-flex rounded-xl p-2 ${colors[tone]}`}><Icon className="h-5 w-5" /></div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function HealthRow({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-[var(--pp-ink)]" /> : <XCircle className="h-4 w-4 text-red-600" />}<span className="text-sm font-medium">{label}</span></div><span className="text-xs text-muted-foreground">{value}</span></div>; }
function ResourceBar({ label, value }: { label: string; value: number }) { return <div><div className="mb-1.5 flex justify-between text-xs"><span>{label}</span><span>{value.toFixed(1)}%</span></div><Progress value={Math.min(100, value)} className="h-2" /></div>; }
function QueueStat({ label, value }: { label: string; value: string | number }) { return <div><p className="text-sm font-bold">{value}</p><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div>; }
function BusinessStat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-[0.18em] text-stone-400">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function EmptyState({ text }: { text: string }) { return <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground"><HardDrive className="mr-2 h-4 w-4" />{text}</div>; }
