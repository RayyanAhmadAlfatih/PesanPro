"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, FileUp, History, Pencil, RefreshCw, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { useSession } from "@/components/dashboard/session-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ScheduleExecution = {
  id: string;
  status: "CLAIMED" | "ENQUEUED" | "SKIPPED" | "FAILED";
  scheduledFor: string;
  attempt: number;
  safeErrorCode: string | null;
  messageJob: { id: string; status: string; safeErrorCode: string | null } | null;
};

type Schedule = {
  id: string;
  recipient: string;
  text: string | null;
  mediaId: string | null;
  mediaType: string | null;
  nextRunAt: string;
  startAt: string;
  timezone: string;
  kind: "ONE_TIME" | "RECURRING";
  cronExpression: string | null;
  missedRunPolicy: "SEND_LATE" | "SKIP" | "CANCEL";
  misfireGraceSeconds: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED" | "FAILED";
  lastRunAt: string | null;
  error: { code: string; message: string | null } | null;
  executions: ScheduleExecution[];
};

type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };

const TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "UTC"];

function localDateTimeForZone(timezone: string, date = new Date(Date.now() + 10 * 60_000)) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}`;
  } catch {
    return "";
  }
}

function formatInZone(value: string | null, timezone: string) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function errorMessage(payload: ApiEnvelope<unknown>, fallback: string) {
  return payload.error?.message || fallback;
}

export default function SchedulerPage() {
  const { sessionId } = useSession();
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("");
  const [mediaId, setMediaId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [timezone, setTimezone] = useState(browserTimezone);
  const [localDateTime, setLocalDateTime] = useState(() => localDateTimeForZone(browserTimezone));
  const [kind, setKind] = useState<"ONE_TIME" | "RECURRING">("ONE_TIME");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [missedRunPolicy, setMissedRunPolicy] = useState<"SEND_LATE" | "SKIP" | "CANCEL">("SEND_LATE");
  const [misfireGraceSeconds, setMisfireGraceSeconds] = useState("300");

  const loadSchedules = async (targetSessionId = sessionId) => {
    if (!targetSessionId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/schedules?sessionId=${encodeURIComponent(targetSessionId)}&limit=100`, { cache: "no-store" });
      const payload = await response.json() as ApiEnvelope<Schedule[]>;
      if (!response.ok || !payload.data) throw new Error(errorMessage(payload, "Failed to load schedules"));
      setSchedules(payload.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulesEvent = useEffectEvent((targetSessionId: string) => loadSchedules(targetSessionId));

  useEffect(() => {
    if (sessionId) void loadSchedulesEvent(sessionId);
    else setSchedules([]);
  }, [sessionId]);

  const resetForm = () => {
    setEditingId(null);
    setRecipient("");
    setText("");
    setMediaId("");
    setFile(null);
    setFileInputKey((value) => value + 1);
    setKind("ONE_TIME");
    setCronExpression("0 9 * * *");
    setMissedRunPolicy("SEND_LATE");
    setMisfireGraceSeconds("300");
    setLocalDateTime(localDateTimeForZone(timezone));
  };

  const editSchedule = (schedule: Schedule) => {
    setEditingId(schedule.id);
    setRecipient(schedule.recipient);
    setText(schedule.text ?? "");
    setMediaId(schedule.mediaId ?? "");
    setFile(null);
    setFileInputKey((value) => value + 1);
    setTimezone(schedule.timezone);
    setLocalDateTime(localDateTimeForZone(schedule.timezone, new Date(schedule.nextRunAt)));
    setKind(schedule.kind);
    setCronExpression(schedule.cronExpression ?? "0 9 * * *");
    setMissedRunPolicy(schedule.missedRunPolicy);
    setMisfireGraceSeconds(String(schedule.misfireGraceSeconds));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadMedia = async () => {
    if (!file || !sessionId) return mediaId || undefined;
    const form = new FormData();
    form.set("file", file);
    form.set("sessionId", sessionId);
    const response = await fetch("/api/v1/media", { method: "POST", body: form });
    const payload = await response.json() as ApiEnvelope<{ id: string }>;
    if (!response.ok || !payload.data) throw new Error(errorMessage(payload, "Media upload failed"));
    return payload.data.id;
  };

  const saveSchedule = async () => {
    if (!sessionId || !recipient.trim() || (!text.trim() && !mediaId && !file)) {
      toast.error("Recipient and text or media are required");
      return;
    }
    setSaving(true);
    try {
      const uploadedMediaId = await uploadMedia();
      const response = await fetch(editingId ? `/api/v1/schedules/${editingId}` : "/api/v1/schedules", {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          recipient: recipient.trim(),
          text: text.trim() || undefined,
          mediaId: uploadedMediaId,
          localDateTime,
          timezone,
          kind,
          cronExpression: kind === "RECURRING" ? cronExpression : undefined,
          missedRunPolicy,
          misfireGraceSeconds: Number(misfireGraceSeconds),
        }),
      });
      const payload = await response.json() as ApiEnvelope<Schedule>;
      if (!response.ok || !payload.data) throw new Error(errorMessage(payload, "Schedule could not be saved"));
      toast.success(editingId ? "Schedule updated" : "Message scheduled");
      resetForm();
      await loadSchedules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Schedule could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const cancelSchedule = async () => {
    if (!cancelId || !sessionId) return;
    try {
      const response = await fetch(`/api/v1/schedules/${cancelId}?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      const payload = await response.json() as ApiEnvelope<Schedule>;
      if (!response.ok || !payload.data) throw new Error(errorMessage(payload, "Schedule could not be cancelled"));
      toast.success("Schedule cancelled");
      setCancelId(null);
      await loadSchedules();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Schedule could not be cancelled");
    }
  };

  const active = schedules.filter((schedule) => schedule.status === "ACTIVE");
  const history = schedules.filter((schedule) => schedule.status !== "ACTIVE");

  const scheduleCards = (items: Schedule[]) => items.length === 0 ? (
    <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
      Belum ada jadwal pada tampilan ini.
    </div>
  ) : (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((schedule) => {
        const latest = schedule.executions[0];
        return (
          <Card key={schedule.id} className="overflow-hidden border-[var(--pp-line)] shadow-none">
            <div className={`h-1 ${schedule.status === "ACTIVE" ? "bg-[var(--pp-ink)]" : schedule.status === "FAILED" ? "bg-destructive" : "bg-muted"}`} />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate font-mono text-base">{schedule.recipient}</CardTitle>
                  <CardDescription className="mt-1 line-clamp-2">{schedule.text || `[${schedule.mediaType || "media"}]`}</CardDescription>
                </div>
                <Badge variant="outline" className="shrink-0">{schedule.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-xs">
                <div><span className="block text-muted-foreground">Next run</span><strong>{formatInZone(schedule.nextRunAt, schedule.timezone)}</strong></div>
                <div><span className="block text-muted-foreground">Timezone</span><strong>{schedule.timezone}</strong></div>
                <div><span className="block text-muted-foreground">Mode</span><strong>{schedule.kind === "RECURRING" ? schedule.cronExpression : "One time"}</strong></div>
                <div><span className="block text-muted-foreground">Missed run</span><strong>{schedule.missedRunPolicy} / {schedule.misfireGraceSeconds}s</strong></div>
              </div>
              {schedule.error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"><strong>{schedule.error.code}</strong>: {schedule.error.message}</div>}
              {latest && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {latest.status === "ENQUEUED" ? <CheckCircle2 className="h-4 w-4 text-[var(--pp-ink)]" /> : latest.status === "FAILED" ? <XCircle className="h-4 w-4 text-destructive" /> : <History className="h-4 w-4" />}
                  Latest occurrence: {latest.status}, attempt {latest.attempt}
                  {latest.messageJob && `, job ${latest.messageJob.status}`}
                </div>
              )}
              {schedule.status === "ACTIVE" && (
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => editSchedule(schedule)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setCancelId(schedule.id)}><Trash2 className="mr-2 h-3.5 w-3.5" />Cancel</Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <SessionGuard>
      <div className="space-y-6 pb-10">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Durable scheduler</Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Scheduled delivery, without guesswork.</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Timezone-aware execution, private media, missed-run policy, and durable queue handoff.</p>
          </div>
          <Button variant="outline" onClick={() => loadSchedules()} disabled={loading || !sessionId}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>

        <Card className="border-[var(--pp-line)] shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[var(--pp-ink)]" />{editingId ? "Edit schedule" : "Create a schedule"}</CardTitle>
            <CardDescription>Local time is interpreted in the selected IANA timezone. A recurring cron uses five fields.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="recipient">Recipient</Label><Input id="recipient" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="628123456789 or group JID" /></div>
            <div className="space-y-2"><Label htmlFor="local-time">First run (local time)</Label><Input id="local-time" type="datetime-local" step="1" value={localDateTime} onChange={(event) => setLocalDateTime(event.target.value)} /></div>
            <div className="space-y-2 lg:col-span-2"><Label htmlFor="message">Message</Label><Textarea id="message" value={text} onChange={(event) => setText(event.target.value)} placeholder="Message text or caption" className="min-h-24" /></div>
            <div className="space-y-2"><Label htmlFor="timezone">IANA timezone</Label><Input id="timezone" list="schedule-timezones" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><datalist id="schedule-timezones">{TIMEZONES.map((value) => <option key={value} value={value} />)}</datalist></div>
            <div className="space-y-2"><Label>Schedule type</Label><Select value={kind} onValueChange={(value: "ONE_TIME" | "RECURRING") => setKind(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ONE_TIME">One time</SelectItem><SelectItem value="RECURRING">Recurring cron</SelectItem></SelectContent></Select></div>
            {kind === "RECURRING" && <div className="space-y-2 lg:col-span-2"><Label htmlFor="cron">Cron expression</Label><Input id="cron" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} placeholder="0 9 * * *" className="font-mono" /><p className="text-xs text-muted-foreground">Example: <code>0 9 * * 1-5</code> runs at 09:00 every weekday in the chosen timezone.</p></div>}
            <div className="space-y-2"><Label>Missed-run policy</Label><Select value={missedRunPolicy} onValueChange={(value: "SEND_LATE" | "SKIP" | "CANCEL") => setMissedRunPolicy(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SEND_LATE">Send late</SelectItem><SelectItem value="SKIP">Skip occurrence</SelectItem><SelectItem value="CANCEL">Cancel schedule</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="grace">Grace period (seconds)</Label><Input id="grace" type="number" min="0" max="86400" value={misfireGraceSeconds} onChange={(event) => setMisfireGraceSeconds(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="media"><FileUp className="mr-1.5 inline h-4 w-4" />Private media upload</Label><Input key={fileInputKey} id="media" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
            <div className="space-y-2"><Label htmlFor="media-id">Existing media ID</Label><Input id="media-id" value={mediaId} onChange={(event) => setMediaId(event.target.value)} placeholder="Optional private media ID" className="font-mono" /></div>
            <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
              {editingId && <Button variant="outline" onClick={resetForm}><RotateCcw className="mr-2 h-4 w-4" />Discard edit</Button>}
              <Button onClick={saveSchedule} disabled={saving}><Clock3 className="mr-2 h-4 w-4" />{saving ? "Saving..." : editingId ? "Update schedule" : "Schedule message"}</Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="active">
          <TabsList><TabsTrigger value="active">Active ({active.length})</TabsTrigger><TabsTrigger value="history">History ({history.length})</TabsTrigger></TabsList>
          <TabsContent value="active" className="mt-4">{loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading schedules...</div> : scheduleCards(active)}</TabsContent>
          <TabsContent value="history" className="mt-4">{loading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading schedules...</div> : scheduleCards(history)}</TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={Boolean(cancelId)} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancel this schedule?</AlertDialogTitle><AlertDialogDescription>The record and execution history remain available for audit, but no future occurrence will be queued.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep active</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={cancelSchedule}>Cancel schedule</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </SessionGuard>
  );
}
