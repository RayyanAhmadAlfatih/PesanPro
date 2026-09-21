"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Ban, CheckCheck, Clock3, LoaderCircle, RefreshCw, RotateCcw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

type JobStatus = "QUEUED" | "PROCESSING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELLED";
type MessageJob = {
  id: string;
  status: JobStatus;
  type: string;
  recipient: string;
  attempts: number;
  maxAttempts: number;
  error: { code: string; message: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

const statusStyle: Record<JobStatus, string> = {
  QUEUED: "border-amber-200 bg-amber-50 text-amber-800",
  PROCESSING: "border-sky-200 bg-sky-50 text-sky-800",
  SENT: "border-[var(--pp-line)] bg-[var(--pp-mint)] text-[var(--pp-ink)]",
  DELIVERED: "border-teal-200 bg-teal-50 text-teal-800",
  READ: "border-[var(--pp-line)] bg-[var(--pp-teal)] text-[var(--pp-ink)]",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-700",
};

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "PROCESSING") return <LoaderCircle className="h-3.5 w-3.5 animate-spin" />;
  if (status === "FAILED") return <XCircle className="h-3.5 w-3.5" />;
  if (status === "CANCELLED") return <Ban className="h-3.5 w-3.5" />;
  if (status === "DELIVERED" || status === "READ") return <CheckCheck className="h-3.5 w-3.5" />;
  if (status === "SENT") return <Send className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
}

export default function MessageQueuePage() {
  const [jobs, setJobs] = useState<MessageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadJobs(silent = false) {
    try {
      const response = await fetch("/api/v1/messages?limit=100", { cache: "no-store" });
      const payload = await response.json() as { data?: MessageJob[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Could not load message queue");
      setJobs(payload.data ?? []);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load message queue");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const loadJobsEffect = useEffectEvent(loadJobs);

  useEffect(() => {
    void loadJobsEffect();
    const timer = setInterval(() => void loadJobsEffect(true), 3000);
    return () => clearInterval(timer);
  }, []);

  async function mutateJob(job: MessageJob, action: "cancel" | "retry") {
    setBusyId(job.id);
    try {
      const response = await fetch(action === "retry" ? `/api/v1/messages/${job.id}/retry` : `/api/v1/messages/${job.id}`, {
        method: action === "retry" ? "POST" : "DELETE",
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || `Could not ${action} message`);
      toast.success(action === "retry" ? "Message queued again" : "Queued message cancelled");
      await loadJobs(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action} message`);
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING").length;
  const failedCount = jobs.filter((job) => job.status === "FAILED").length;

  return (
    <div className="space-y-6 pb-12">
      <section className="relative overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)] p-6 shadow-sm md:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--pp-mint)] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--pp-ink)]">Reliable delivery</p>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Message Queue</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Pantau setiap pesan dari antrean hingga dibaca. Retry aman dan cancellation hanya tersedia pada state yang diizinkan.</p>
          </div>
          <button onClick={() => void loadJobs()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:border-[var(--pp-line)] hover:text-[var(--pp-ink)]">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Last 100 jobs</p><p className="mt-2 text-3xl font-black">{jobs.length}</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active</p><p className="mt-2 text-3xl font-black text-sky-700">{activeCount}</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Needs attention</p><p className="mt-2 text-3xl font-black text-red-700">{failedCount}</p></div>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading queue...</div>
        ) : jobs.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><Send className="mb-3 h-8 w-8 text-[var(--pp-ink)]" /><p className="font-bold">Queue masih kosong</p><p className="mt-1 text-sm text-muted-foreground">Pesan dari Chat atau Developer API akan muncul di sini.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Status</th><th className="px-5 py-3">Destination</th><th className="px-5 py-3">Attempt</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Result</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <tr key={job.id} className="align-top hover:bg-muted/20">
                    <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle[job.status]}`}><StatusIcon status={job.status} />{job.status}</span><p className="mt-2 font-mono text-[10px] text-muted-foreground">{job.id}</p></td>
                    <td className="px-5 py-4"><p className="font-semibold text-foreground">{job.recipient}</p><p className="mt-1 text-xs text-muted-foreground">{job.type}</p></td>
                    <td className="px-5 py-4 font-semibold">{job.attempts} / {job.maxAttempts}</td>
                    <td className="px-5 py-4 text-muted-foreground">{new Date(job.createdAt).toLocaleString("id-ID")}</td>
                    <td className="max-w-xs px-5 py-4">{job.error ? <><p className="font-mono text-xs font-bold text-red-700">{job.error.code}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{job.error.message}</p></> : <span className="text-muted-foreground">No error</span>}</td>
                    <td className="px-5 py-4 text-right">
                      {job.status === "QUEUED" && <button disabled={busyId === job.id} onClick={() => void mutateJob(job, "cancel")} className="rounded-lg border px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-50">Cancel</button>}
                      {job.status === "FAILED" && <button disabled={busyId === job.id} onClick={() => void mutateJob(job, "retry")} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pp-ink)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--pp-ink)] disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
