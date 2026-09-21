"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Download,
  Eye,
  FileUp,
  History,
  Info,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  ShieldCheck,
  Tag,
  Trash2,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { useSession } from "@/components/dashboard/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type BroadcastStatus = "DRAFT" | "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";
type Broadcast = {
  id: string;
  name: string | null;
  message: string;
  status: BroadcastStatus;
  progress: { total: number; enqueued: number; failed: number; skipped: number; cancelled: number; pending: number; percent: number };
  error: { code: string; message: string | null } | null;
  delayMinMs: number;
  delayMaxMs: number;
  requireOptIn: boolean;
  createdAt: string;
};
type Suppression = { id: string; jid: string; reason: string; createdAt: string };
type RecipientData = { recipient: string; variables: Record<string, string> };
type ImportResult = {
  recipients: string[];
  recipientData: RecipientData[];
  rowsRead: number;
  duplicatesRemoved: number;
  groupsExcluded: number;
  headers: string[];
  variableHeaders: string[];
};
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

function displayRecipient(jid: string) {
  return jid.replace("@s.whatsapp.net", "");
}

function statusTone(status: BroadcastStatus) {
  if (status === "COMPLETED") return "pp-status-ok";
  if (status === "FAILED" || status === "CANCELLED") return "pp-status-off";
  if (status === "PAUSED") return "pp-status-warn";
  return "pp-status-info";
}

function variablesInTemplate(message: string) {
  return [...message.matchAll(/{{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*}}/g)].map((match) => match[1]).filter((value, index, all) => all.indexOf(value) === index);
}

export default function BroadcastPage() {
  const { sessionId } = useSession();
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState("");
  const [recipientData, setRecipientData] = useState<RecipientData[] | null>(null);
  const [variableHeaders, setVariableHeaders] = useState<string[]>([]);
  const [message, setMessage] = useState("{Halo|Hai} {{name}}, ada kabar terbaru untuk Anda.");
  const [mediaId, setMediaId] = useState("");
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("20");
  const [requireOptIn, setRequireOptIn] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suppressedRecipient, setSuppressedRecipient] = useState("");

  async function loadBroadcasts() {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/v1/broadcasts?sessionId=${encodeURIComponent(sessionId)}&limit=50`, { cache: "no-store" });
      const payload = await response.json() as ApiEnvelope<Broadcast[]>;
      if (response.ok) setBroadcasts(payload.data ?? []);
    } catch {
      // Keep the last durable snapshot visible during a temporary network error.
    } finally {
      setLoading(false);
    }
  }

  async function loadSuppressions() {
    try {
      const response = await fetch("/api/v1/suppressions?limit=500", { cache: "no-store" });
      const payload = await response.json() as ApiEnvelope<Suppression[]>;
      if (response.ok) setSuppressions(payload.data ?? []);
    } catch {
      // The next poll or tab visit can recover without discarding current data.
    }
  }

  const loadBroadcastsEffect = useEffectEvent(loadBroadcasts);
  const loadSuppressionsEffect = useEffectEvent(loadSuppressions);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    void loadBroadcastsEffect();
    void loadSuppressionsEffect();
    const timer = window.setInterval(() => void loadBroadcastsEffect(), 3000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  const templateVariables = useMemo(() => variablesInTemplate(message), [message]);
  const missingVariableColumns = useMemo(
    () => templateVariables.filter((variable) => !variableHeaders.includes(variable)),
    [templateVariables, variableHeaders],
  );

  const previewSpintax = async () => {
    if (!message.trim()) return;
    setPreviewing(true);
    try {
      const response = await fetch("/api/v1/broadcasts/spintax/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, count: 5, variables: recipientData?.[0]?.variables }),
      });
      const payload = await response.json() as ApiEnvelope<{ samples: string[]; combinations: number }>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Template pesan tidak valid");
      setPreview(payload.data.samples);
      toast.success(`${payload.data.combinations} kombinasi template valid`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview gagal");
    } finally {
      setPreviewing(false);
    }
  };

  const create = async () => {
    if (!sessionId) return toast.error("Pilih perangkat WhatsApp terlebih dahulu");
    const targetList = recipients.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean);
    if (targetList.length === 0 || !message.trim()) return toast.error("Penerima dan pesan wajib diisi");
    if (templateVariables.length > 0 && !recipientData) return toast.error("Template menggunakan variabel. Import CSV dengan kolom variabel terlebih dahulu.");
    if (missingVariableColumns.length > 0) return toast.error(`Kolom CSV belum tersedia: ${missingVariableColumns.join(", ")}`);
    setSaving(true);
    try {
      const response = await fetch("/api/v1/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          sessionId,
          name: name.trim() || undefined,
          ...(recipientData && templateVariables.length > 0 ? { recipientData } : { recipients: targetList }),
          message,
          mediaId: mediaId.trim() || undefined,
          delayMinMs: Math.round(Number(delayMin) * 1000),
          delayMaxMs: Math.round(Number(delayMax) * 1000),
          requireOptIn,
        }),
      });
      const payload = await response.json() as ApiEnvelope<Broadcast>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Broadcast gagal dibuat");
      toast.success("Broadcast tersimpan dan masuk antrean durable");
      setRecipients("");
      setRecipientData(null);
      setVariableHeaders([]);
      setName("");
      await loadBroadcasts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Broadcast gagal dibuat");
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("CSV maksimal 2 MB");
    setImporting(true);
    try {
      const response = await fetch("/api/v1/broadcasts/recipients/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: file,
      });
      const payload = await response.json() as ApiEnvelope<ImportResult>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Import CSV gagal");
      setRecipients(payload.data.recipients.map(displayRecipient).join("\n"));
      setRecipientData(payload.data.recipientData);
      setVariableHeaders(payload.data.variableHeaders);
      setPreview([]);
      toast.success(`${payload.data.recipients.length} penerima diimpor; ${payload.data.duplicatesRemoved} duplikat dan ${payload.data.groupsExcluded} grup dilewati`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import CSV gagal");
    } finally {
      setImporting(false);
    }
  };

  const updateRecipientsManually = (value: string) => {
    setRecipients(value);
    if (recipientData) {
      setRecipientData(null);
      setVariableHeaders([]);
      setPreview([]);
    }
  };

  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const input = messageRef.current;
    if (!input) return setMessage((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${token}`);
    const start = input.selectionStart ?? message.length;
    const end = input.selectionEnd ?? start;
    const next = `${message.slice(0, start)}${token}${message.slice(end)}`;
    setMessage(next);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const act = async (broadcast: Broadcast, action: "pause" | "resume" | "cancel") => {
    setActionId(broadcast.id);
    try {
      const path = action === "cancel" ? `/api/v1/broadcasts/${broadcast.id}` : `/api/v1/broadcasts/${broadcast.id}/${action}`;
      const response = await fetch(path, { method: action === "cancel" ? "DELETE" : "POST" });
      const payload = await response.json() as ApiEnvelope<Broadcast>;
      if (!response.ok) throw new Error(payload.error?.message || "Perubahan status gagal");
      toast.success(action === "pause" ? "Broadcast dijeda" : action === "resume" ? "Broadcast dilanjutkan" : "Broadcast dibatalkan");
      await loadBroadcasts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Perubahan status gagal");
    } finally {
      setActionId(null);
    }
  };

  const addSuppressed = async () => {
    if (!suppressedRecipient.trim()) return;
    const response = await fetch("/api/v1/suppressions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: suppressedRecipient, reason: "MANUAL" }),
    });
    const payload = await response.json() as ApiEnvelope<Suppression>;
    if (!response.ok) return toast.error(payload.error?.message || "Gagal menambahkan suppression");
    setSuppressedRecipient("");
    toast.success("Nomor tidak akan menerima broadcast berikutnya");
    await loadSuppressions();
  };

  const removeSuppressed = async (jid: string) => {
    const response = await fetch(`/api/v1/suppressions/${encodeURIComponent(jid)}`, { method: "DELETE" });
    const payload = await response.json() as ApiEnvelope<unknown>;
    if (!response.ok) return toast.error(payload.error?.message || "Gagal menghapus suppression");
    toast.success("Nomor dikeluarkan dari suppression list");
    await loadSuppressions();
  };

  const recipientCount = recipients.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean).length;
  const personalizationBlocked = templateVariables.length > 0 && (!recipientData || missingVariableColumns.length > 0);

  return (
    <SessionGuard>
      <div className="space-y-8">
        <header className="pp-page-head">
          <div>
            <span className="pp-eyebrow">Messaging</span>
            <h1 className="pp-page-title">Broadcast</h1>
            <p className="pp-page-description">Kirim pesan massal dengan delay, suppression, personalisasi CSV, dan pelacakan penerima yang tetap tahan restart.</p>
          </div>
          <Button variant="outline" onClick={() => void loadBroadcasts()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Segarkan</Button>
        </header>

        <Tabs defaultValue="compose">
          <TabsList><TabsTrigger value="compose"><Megaphone /> Buat</TabsTrigger><TabsTrigger value="history"><History /> Riwayat</TabsTrigger><TabsTrigger value="suppression"><ShieldCheck /> Jangan kirim</TabsTrigger></TabsList>

          <TabsContent value="compose" className="mt-6 space-y-5">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl"><UsersRound /> Penerima</CardTitle>
                  <CardDescription>Masukkan nomor manual atau import CSV. Duplikat otomatis dihapus dan grup dilewati.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2"><Label>Nama broadcast</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Pengingat invoice September" /></div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div><Label>Nomor tujuan</Label><p className="mt-1 text-xs text-muted-foreground">Satu nomor per baris · maksimal 5.000 penerima unik.</p></div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm"><a href="/templates/pesanpro-broadcast-template.csv" download><Download /> Unduh contoh CSV</a></Button>
                        <Label className="cursor-pointer">
                          <Input className="sr-only" type="file" accept=".csv,text/csv" disabled={importing} onChange={(event) => { void importCsv(event.target.files?.[0]); event.target.value = ""; }} />
                          <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--pp-ink)] bg-[var(--pp-teal)] px-3 text-xs font-semibold max-[520px]:min-h-11">{importing ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Import CSV</span>
                        </Label>
                      </div>
                    </div>
                    <Textarea className="min-h-56 font-mono" value={recipients} onChange={(event) => updateRecipientsManually(event.target.value)} placeholder={"628123456789\n628987654321"} />
                    <p className="text-xs text-muted-foreground">{recipientCount} penerima terdeteksi.{recipientData ? " Data personalisasi aktif dari CSV." : " Mode nomor manual."}</p>
                  </div>

                  {variableHeaders.length > 0 && (
                    <div className="rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-mint)] p-4">
                      <div className="flex items-center gap-2"><Tag className="size-4" /><p className="font-semibold">Variabel dari CSV</p></div>
                      <p className="mt-1 text-xs text-muted-foreground">Klik tag untuk menyisipkannya ke posisi kursor pada pesan.</p>
                      <div className="mt-3 flex flex-wrap gap-2">{variableHeaders.map((variable) => <button type="button" key={variable} onClick={() => insertVariable(variable)} className="rounded-full border border-[var(--pp-ink)] bg-[var(--pp-paper)] px-3 py-1.5 font-mono text-xs font-semibold hover:bg-[var(--pp-highlight)]">{`{{${variable}}}`}</button>)}</div>
                    </div>
                  )}

                  {recipientData && recipientData.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-[var(--pp-line)] bg-white">
                      <table className="!min-w-[520px] text-sm">
                        <thead><tr><th>Nomor</th>{variableHeaders.slice(0, 3).map((header) => <th key={header}>{header}</th>)}</tr></thead>
                        <tbody>{recipientData.slice(0, 3).map((row) => <tr key={row.recipient}><td className="font-mono">{displayRecipient(row.recipient)}</td>{variableHeaders.slice(0, 3).map((header) => <td key={header}>{row.variables[header] || "—"}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--pp-line)] p-4"><div><Label htmlFor="opt-in">Wajib opt-in</Label><p className="text-xs text-muted-foreground">Lewati kontak tanpa consent aktif.</p></div><Switch id="opt-in" checked={requireOptIn} onCheckedChange={setRequireOptIn} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Pesan & personalisasi</CardTitle>
                  <CardDescription>Gunakan <code>{"{{name}}"}</code> untuk kolom CSV dan <code>{"{Halo|Hai}"}</code> untuk variasi Spintax.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2"><Label>Template pesan</Label><Textarea ref={messageRef} className="min-h-44" value={message} onChange={(event) => { setMessage(event.target.value); setPreview([]); }} /></div>

                  {templateVariables.length > 0 && (
                    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${personalizationBlocked ? "border-[var(--pp-danger)] bg-white text-[var(--pp-danger)]" : "border-[var(--pp-ink)] bg-[var(--pp-teal)] text-[var(--pp-ink)]"}`}>
                      <Info className="mt-0.5 size-4 shrink-0" />
                      <span>{personalizationBlocked ? `Template membutuhkan ${templateVariables.map((item) => `{{${item}}}`).join(", ")}. Import CSV dengan kolom yang sesuai.` : `Personalisasi siap untuk ${recipientData?.length ?? 0} penerima.`}</span>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Delay minimum</Label><Input type="number" min="2" max="60" value={delayMin} onChange={(event) => setDelayMin(event.target.value)} /><p className="text-xs text-muted-foreground">Detik</p></div><div className="space-y-2"><Label>Delay maksimum</Label><Input type="number" min="2" max="120" value={delayMax} onChange={(event) => setDelayMax(event.target.value)} /><p className="text-xs text-muted-foreground">Detik</p></div><div className="space-y-2"><Label>Media ID</Label><Input value={mediaId} onChange={(event) => setMediaId(event.target.value)} placeholder="Opsional" /></div></div>

                  <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={previewSpintax} disabled={previewing || !message.trim()}>{previewing ? <Loader2 className="animate-spin" /> : <Eye />} Preview</Button><Button onClick={create} disabled={saving || recipientCount === 0 || !message.trim() || personalizationBlocked}>{saving ? <Loader2 className="animate-spin" /> : <Send />} Simpan & antrekan</Button></div>

                  {preview.length > 0 && <div className="space-y-2 rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-highlight)] p-4"><p className="pp-eyebrow !text-[var(--pp-ink)]">Preview penerima pertama</p>{preview.map((sample, index) => <p key={`${sample}-${index}`} className="rounded-md border border-[var(--pp-line)] bg-[var(--pp-paper)] px-3 py-2 text-sm">{sample}</p>)}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card><CardHeader><CardTitle className="text-2xl">Riwayat broadcast</CardTitle><CardDescription>Status dibaca dari database setiap tiga detik, bukan dari memori browser.</CardDescription></CardHeader><CardContent className="space-y-3">{broadcasts.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Belum ada broadcast untuk perangkat ini.</div> : broadcasts.map((item) => <div key={item.id} className="rounded-xl border border-[var(--pp-line)] p-4 hover:bg-[color-mix(in_srgb,var(--pp-highlight)_14%,transparent)]"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.name || "Broadcast tanpa nama"}</p><Badge variant="outline" className={statusTone(item.status)}>{item.status}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.message}</p><p className="mt-2 font-mono text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("id-ID")} · delay {item.delayMinMs / 1000}-{item.delayMaxMs / 1000} detik</p></div><div className="flex shrink-0 gap-2">{["QUEUED", "RUNNING"].includes(item.status) && <Button size="sm" variant="outline" disabled={actionId === item.id} onClick={() => void act(item, "pause")}><CirclePause /> Jeda</Button>}{["PAUSED", "FAILED"].includes(item.status) && <Button size="sm" variant="outline" disabled={actionId === item.id} onClick={() => void act(item, "resume")}><CirclePlay /> Lanjut</Button>}{!["COMPLETED", "CANCELLED"].includes(item.status) && <Button size="sm" variant="destructive" disabled={actionId === item.id} onClick={() => void act(item, "cancel")}><XCircle /> Batal</Button>}</div></div><div className="mt-4 space-y-2"><div className="flex justify-between text-xs"><span>{item.progress.enqueued} masuk antrean · {item.progress.skipped} dilewati · {item.progress.failed} gagal enqueue</span><span>{item.progress.percent}%</span></div><Progress value={item.progress.percent} /><div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>{item.progress.pending} pending</span><span>{item.progress.cancelled} batal</span>{item.requireOptIn && <span>opt-in aktif</span>}</div>{item.error && <p className="rounded-md border border-[var(--pp-danger)] bg-white px-3 py-2 text-xs text-[var(--pp-danger)]">{item.error.code}: {item.error.message}</p>}</div></div>)}</CardContent></Card>
          </TabsContent>

          <TabsContent value="suppression" className="mt-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><Ban /> Daftar jangan kirim</CardTitle><CardDescription>Perintah STOP/BERHENTI dari pesan masuk ditambahkan otomatis. Admin juga dapat mengelolanya manual.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex max-w-xl gap-2"><Input value={suppressedRecipient} onChange={(event) => setSuppressedRecipient(event.target.value)} placeholder="628123456789" /><Button onClick={addSuppressed}><Ban /> Blokir</Button></div><div className="divide-y divide-[var(--pp-line)] rounded-xl border border-[var(--pp-line)]">{suppressions.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Suppression list kosong.</p> : suppressions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 p-3"><div><p className="font-mono text-sm">{displayRecipient(item.jid)}</p><p className="text-xs text-muted-foreground">{item.reason} · {new Date(item.createdAt).toLocaleString("id-ID")}</p></div><Button size="icon-sm" variant="ghost" aria-label="Hapus suppression" onClick={() => void removeSuppressed(item.jid)}><Trash2 /></Button></div>)}</div><div className="flex items-start gap-2 rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-mint)] p-3 text-xs"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> Worker memeriksa daftar ini lagi tepat sebelum enqueue, sehingga opt-out yang datang setelah broadcast dibuat tetap dihormati.</div></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </SessionGuard>
  );
}
