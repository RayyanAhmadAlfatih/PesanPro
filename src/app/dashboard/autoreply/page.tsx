"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Activity, BotMessageSquare, FlaskConical, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { useSession } from "@/components/dashboard/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createAutoReply,
  deleteAutoReply,
  getAutoReplies,
  getAutoReplyLogs,
  testAutoReply,
  toggleAutoReply,
  updateAutoReply,
} from "./actions";

type MatchType = "EXACT" | "CONTAINS" | "STARTS_WITH" | "REGEX" | "FALLBACK";
type TriggerType = "ALL" | "GROUP" | "PRIVATE";
type Rule = Awaited<ReturnType<typeof getAutoReplies>>[number];
type TriggerLog = Awaited<ReturnType<typeof getAutoReplyLogs>>[number];

type EditorState = {
  name: string;
  keyword: string;
  matchType: MatchType;
  response: string;
  mediaId: string;
  triggerType: TriggerType;
  priority: string;
  timezone: string;
  activeDays: string;
  activeStartTime: string;
  activeEndTime: string;
  cooldownSeconds: string;
  rateLimitCount: string;
  rateLimitWindowSeconds: string;
  maxChainDepth: string;
  isEnabled: boolean;
};

const emptyEditor: EditorState = {
  name: "",
  keyword: "",
  matchType: "EXACT",
  response: "",
  mediaId: "",
  triggerType: "ALL",
  priority: "100",
  timezone: "Asia/Jakarta",
  activeDays: "",
  activeStartTime: "",
  activeEndTime: "",
  cooldownSeconds: "30",
  rateLimitCount: "5",
  rateLimitWindowSeconds: "60",
  maxChainDepth: "3",
  isEnabled: true,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Terjadi kesalahan";
}

function toEditor(rule: Rule): EditorState {
  return {
    name: rule.name ?? "",
    keyword: rule.keyword,
    matchType: rule.matchType,
    response: rule.response ?? "",
    mediaId: rule.media?.id ?? "",
    triggerType: rule.triggerType,
    priority: String(rule.priority),
    timezone: rule.timezone,
    activeDays: Array.isArray(rule.activeDays) ? rule.activeDays.join(",") : "",
    activeStartTime: rule.activeStartTime ?? "",
    activeEndTime: rule.activeEndTime ?? "",
    cooldownSeconds: String(rule.cooldownSeconds),
    rateLimitCount: String(rule.rateLimitCount),
    rateLimitWindowSeconds: String(rule.rateLimitWindowSeconds),
    maxChainDepth: String(rule.maxChainDepth),
    isEnabled: rule.isEnabled,
  };
}

export default function AutoReplyPage() {
  const { sessionId } = useSession();
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<TriggerLog[]>([]);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewGroup, setPreviewGroup] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  async function load(silent = false) {
    if (!sessionId) return;
    try {
      const [nextRules, nextLogs] = await Promise.all([getAutoReplies(sessionId), getAutoReplyLogs(sessionId, 30)]);
      setRules(nextRules);
      setLogs(nextLogs);
    } catch (error) {
      if (!silent) toast.error(errorMessage(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const loadEffect = useEffectEvent(load);
  useEffect(() => { void loadEffect(); }, [sessionId]);

  function setField<K extends keyof EditorState>(field: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  function payload() {
    const activeDays = editor.activeDays.trim()
      ? editor.activeDays.split(",").map((item) => Number(item.trim()))
      : undefined;
    return {
      name: editor.name.trim() || undefined,
      keyword: editor.matchType === "FALLBACK" ? "" : editor.keyword.trim(),
      matchType: editor.matchType,
      response: editor.response.trim() || undefined,
      mediaId: editor.mediaId.trim() || undefined,
      triggerType: editor.triggerType,
      priority: Number(editor.priority),
      timezone: editor.timezone.trim(),
      activeDays,
      activeStartTime: editor.activeStartTime || undefined,
      activeEndTime: editor.activeEndTime || undefined,
      cooldownSeconds: Number(editor.cooldownSeconds),
      rateLimitCount: Number(editor.rateLimitCount),
      rateLimitWindowSeconds: Number(editor.rateLimitWindowSeconds),
      maxChainDepth: Number(editor.maxChainDepth),
      isEnabled: editor.isEnabled,
    };
  }

  async function saveRule() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const result = editingId
        ? await updateAutoReply(sessionId, editingId, payload())
        : await createAutoReply(sessionId, payload());
      toast.success(editingId ? "Rule diperbarui dan versinya dinaikkan" : "Rule durable dibuat");
      if (result.warnings.length > 0) toast.warning(result.warnings[0].message);
      setEditor(emptyEditor);
      setEditingId(null);
      await load(true);
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  async function removeRule(rule: Rule) {
    if (!sessionId || !window.confirm(`Hapus rule ${rule.name || rule.keyword || "fallback"}? Log historis tetap disimpan.`)) return;
    try {
      await deleteAutoReply(sessionId, rule.id);
      toast.success("Rule dinonaktifkan dan dihapus secara aman");
      await load(true);
    } catch (error) { toast.error(errorMessage(error)); }
  }

  async function toggle(rule: Rule, isEnabled: boolean) {
    if (!sessionId) return;
    try {
      await toggleAutoReply(sessionId, rule.id, isEnabled);
      setRules((current) => current.map((item) => item.id === rule.id ? { ...item, isEnabled } : item));
    } catch (error) { toast.error(errorMessage(error)); }
  }

  async function runPreview() {
    if (!sessionId || !previewText.trim()) return;
    setBusy(true);
    try {
      const result = await testAutoReply(sessionId, previewText, previewGroup);
      setPreviewResult(result.matched
        ? `Match: ${result.selectedRuleId}${result.conflictRuleIds.length ? `, konflik: ${result.conflictRuleIds.join(", ")}` : ""}. Tidak ada pesan dikirim.`
        : "Tidak ada rule yang cocok. Tidak ada pesan dikirim.");
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  return (
    <SessionGuard>
      <div className="space-y-6 pb-12">
        <section className="relative overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)] p-6 shadow-sm md:p-8">
          <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--pp-ink)]">Phase 7 · Durable automation</p><h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Auto Reply Studio</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Rule deterministik, jadwal timezone-aware, cooldown persisten, dan pengiriman melalui message queue.</p></div>
            <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--pp-ink)]" />{editingId ? "Edit rule versioned" : "Buat rule aman"}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label>Nama rule</Label><Input value={editor.name} onChange={(event) => setField("name", event.target.value)} placeholder="Sambutan jam kerja" /></div>
              <div className="space-y-2"><Label>Match type</Label><Select value={editor.matchType} onValueChange={(value: MatchType) => setField("matchType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EXACT">Exact</SelectItem><SelectItem value="CONTAINS">Contains</SelectItem><SelectItem value="STARTS_WITH">Starts with</SelectItem><SelectItem value="REGEX">Safe regex</SelectItem><SelectItem value="FALLBACK">Fallback</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Audience</Label><Select value={editor.triggerType} onValueChange={(value: TriggerType) => setField("triggerType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Semua</SelectItem><SelectItem value="PRIVATE">Private</SelectItem><SelectItem value="GROUP">Group</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label>Keyword / pola</Label><Input disabled={editor.matchType === "FALLBACK"} value={editor.keyword} onChange={(event) => setField("keyword", event.target.value)} placeholder={editor.matchType === "REGEX" ? "^INV-[0-9]{4}$" : "halo"} /><p className="text-xs text-muted-foreground">Regex dibatasi ke subset linear yang aman; fallback wajib tanpa keyword.</p></div>
              <div className="space-y-2 sm:col-span-2"><Label>Balasan</Label><Textarea className="min-h-28" value={editor.response} onChange={(event) => setField("response", event.target.value)} placeholder="Terima kasih, pesan Anda sudah kami terima." /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Private media ID (opsional)</Label><Input className="font-mono" value={editor.mediaId} onChange={(event) => setField("mediaId", event.target.value)} placeholder="Gunakan ID dari Developer API /api/v1/media" /></div>
              <div className="space-y-2"><Label>Prioritas</Label><Input type="number" min="0" max="10000" value={editor.priority} onChange={(event) => setField("priority", event.target.value)} /></div>
              <div className="space-y-2"><Label>Timezone</Label><Input value={editor.timezone} onChange={(event) => setField("timezone", event.target.value)} /></div>
              <div className="space-y-2"><Label>Hari aktif ISO</Label><Input value={editor.activeDays} onChange={(event) => setField("activeDays", event.target.value)} placeholder="1,2,3,4,5" /></div>
              <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label>Mulai</Label><Input type="time" value={editor.activeStartTime} onChange={(event) => setField("activeStartTime", event.target.value)} /></div><div className="space-y-2"><Label>Selesai</Label><Input type="time" value={editor.activeEndTime} onChange={(event) => setField("activeEndTime", event.target.value)} /></div></div>
              <div className="space-y-2"><Label>Cooldown (detik)</Label><Input type="number" value={editor.cooldownSeconds} onChange={(event) => setField("cooldownSeconds", event.target.value)} /></div>
              <div className="space-y-2"><Label>Rate / window</Label><div className="grid grid-cols-2 gap-2"><Input type="number" value={editor.rateLimitCount} onChange={(event) => setField("rateLimitCount", event.target.value)} /><Input type="number" value={editor.rateLimitWindowSeconds} onChange={(event) => setField("rateLimitWindowSeconds", event.target.value)} /></div></div>
              <div className="space-y-2"><Label>Max chain depth</Label><Input type="number" value={editor.maxChainDepth} onChange={(event) => setField("maxChainDepth", event.target.value)} /></div>
              <div className="flex items-end justify-between rounded-xl border p-3"><div><p className="text-sm font-semibold">Aktif</p><p className="text-xs text-muted-foreground">Rule nonaktif tetap tersimpan.</p></div><Switch checked={editor.isEnabled} onCheckedChange={(checked) => setField("isEnabled", checked)} /></div>
              <div className="flex gap-2 sm:col-span-2"><Button className="flex-1" disabled={busy} onClick={() => void saveRule()}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{editingId ? "Simpan versi baru" : "Buat rule"}</Button>{editingId && <Button variant="outline" onClick={() => { setEditingId(null); setEditor(emptyEditor); }}>Batal</Button>}</div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><BotMessageSquare className="h-5 w-5 text-[var(--pp-ink)]" />Rule aktif ({rules.filter((rule) => rule.isEnabled).length}/{rules.length})</CardTitle></CardHeader><CardContent className="space-y-3">{loading ? <div className="flex min-h-32 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin" /></div> : rules.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada rule pada device ini.</p> : rules.map((rule) => <div key={rule.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{rule.name || rule.keyword || "Fallback"}</p><Badge variant="outline">{rule.matchType}</Badge><Badge variant="secondary">P{rule.priority}</Badge><Badge variant="outline">v{rule.version}</Badge></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{rule.response || `Media: ${rule.media?.originalName}`}</p><p className="mt-2 text-xs text-muted-foreground">{rule.triggerType} · {rule.timezone} · cooldown {rule.cooldownSeconds}s</p></div><Switch checked={rule.isEnabled} onCheckedChange={(checked) => void toggle(rule, checked)} /></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingId(rule.id); setEditor(toEditor(rule)); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="ghost" className="text-red-700" onClick={() => void removeRule(rule)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Hapus</Button></div></div>)}</CardContent></Card>

            <Card><CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-amber-700" />Preview tanpa kirim</CardTitle></CardHeader><CardContent className="space-y-3"><Textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} placeholder="Masukkan contoh pesan inbound" /><div className="flex items-center justify-between rounded-xl border p-3"><Label>Simulasikan pesan group</Label><Switch checked={previewGroup} onCheckedChange={setPreviewGroup} /></div><Button variant="outline" className="w-full" disabled={busy || !previewText.trim()} onClick={() => void runPreview()}>Uji rule</Button>{previewResult && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{previewResult}</p>}</CardContent></Card>
          </div>
        </div>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-sky-700" />Trigger log terbaru</CardTitle></CardHeader><CardContent>{logs.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Log akan muncul setelah pesan inbound diproses.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="p-3">Waktu</th><th className="p-3">Pengirim</th><th className="p-3">Pesan</th><th className="p-3">Status</th><th className="p-3">Alasan</th><th className="p-3">Job</th></tr></thead><tbody className="divide-y">{logs.map((log) => <tr key={log.id}><td className="p-3 text-muted-foreground">{new Date(log.createdAt).toLocaleString("id-ID")}</td><td className="p-3 font-mono text-xs">{log.senderJid}</td><td className="max-w-xs truncate p-3">{log.sourceText}</td><td className="p-3"><Badge variant={log.status === "ENQUEUED" ? "default" : "outline"}>{log.status}</Badge></td><td className="p-3 font-mono text-xs">{log.reasonCode || "-"}</td><td className="p-3 font-mono text-xs">{log.messageJobId || "-"}</td></tr>)}</tbody></table></div>}</CardContent></Card>
      </div>
    </SessionGuard>
  );
}
