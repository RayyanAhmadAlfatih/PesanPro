"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { CalendarClock, CirclePause, CirclePlay, Download, Filter, Loader2, RefreshCw, Rocket, Save, Send, Tags, XCircle } from "lucide-react";
import { toast } from "sonner";
import { MediaPicker } from "@/components/dashboard/media-picker";
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

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type Segment = { id: string; name: string; description: string | null; definition: SegmentDefinition; version: number };
type SegmentDefinition = { consentStatuses: string[]; tagIds: string[]; labelIds: string[]; sources: string[]; attributes: Array<{ key: string; operator: string; value?: string }> };
type ContactTag = { id: string; name: string; color: string; _count: { assignments: number } };
type WhatsAppLabel = { id: string; name: string; colorHex: string | null; _count: { chatLabels: number } };
type Campaign = {
  id: string;
  name: string;
  status: "DRAFT" | "SCHEDULED" | "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";
  scheduledAt: string | null;
  progress: { total: number; queued: number; sent: number; delivered: number; read: number; failed: number; skipped: number; unsubscribed: number; cancelled: number; percent: number };
  error: { code: string; message: string | null } | null;
  version: { message: string; segment: { name: string } | null; fallbackPolicy: string; requireOptIn: boolean } | null;
  createdAt: string;
};

const emptyDefinition: SegmentDefinition = { consentStatuses: [], tagIds: [], labelIds: [], sources: [], attributes: [] };

function localDateTime(date = new Date(Date.now() + 10 * 60_000)) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function splitIds(value: string) {
  return value.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

function statusTone(status: Campaign["status"]) {
  if (status === "COMPLETED") return "border-[var(--pp-line)] bg-[var(--pp-mint)] text-[var(--pp-ink)]";
  if (status === "FAILED" || status === "CANCELLED") return "border-red-200 bg-red-50 text-red-800";
  if (status === "PAUSED" || status === "SCHEDULED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export default function CampaignsPage() {
  const { sessionId } = useSession();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [whatsAppLabels, setWhatsAppLabels] = useState<WhatsAppLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [segmentName, setSegmentName] = useState("");
  const [segmentDescription, setSegmentDescription] = useState("");
  const [consent, setConsent] = useState<string[]>(["OPTED_IN"]);
  const [sources, setSources] = useState("WHATSAPP");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [attributeKey, setAttributeKey] = useState("");
  const [attributeValue, setAttributeValue] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [message, setMessage] = useState("{Halo|Hai} pelanggan, kami punya informasi terbaru untuk Anda.");
  const [mediaId, setMediaId] = useState("");
  const [fallbackSessionId, setFallbackSessionId] = useState("");
  const [requireOptIn, setRequireOptIn] = useState(true);
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("20");
  const [scheduled, setScheduled] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta");
  const [scheduleAt, setScheduleAt] = useState(localDateTime());

  async function load() {
    setLoading(true);
    try {
      const [segmentResponse, campaignResponse] = await Promise.all([
        fetch("/api/v1/segments", { cache: "no-store" }),
        fetch("/api/v1/campaigns?limit=50", { cache: "no-store" }),
      ]);
      const segmentPayload = await segmentResponse.json() as ApiEnvelope<Segment[]>;
      const campaignPayload = await campaignResponse.json() as ApiEnvelope<Campaign[]>;
      if (segmentResponse.ok) setSegments(segmentPayload.data ?? []);
      if (campaignResponse.ok) setCampaigns(campaignPayload.data ?? []);
    } catch { /* Preserve the last durable snapshot until the next refresh. */ }
    finally { setLoading(false); }
  }

  const loadEffect = useEffectEvent(load);

  async function loadSegmentReferences(targetSessionId: string) {
    const [tagResponse, labelResponse] = await Promise.all([
      fetch("/api/v1/contact-tags", { cache: "no-store" }),
      fetch(`/api/labels/${encodeURIComponent(targetSessionId)}`, { cache: "no-store" }),
    ]);
    const tagPayload = await tagResponse.json() as ApiEnvelope<ContactTag[]>;
    const labelPayload = await labelResponse.json() as { data?: { labels?: WhatsAppLabel[] } };
    if (tagResponse.ok) {
      const nextTags = tagPayload.data ?? [];
      setContactTags(nextTags);
      setTagIds((current) => current.filter((id) => nextTags.some((tag) => tag.id === id)));
    }
    if (labelResponse.ok) {
      const nextLabels = labelPayload.data?.labels ?? [];
      setWhatsAppLabels(nextLabels);
      setLabelIds((current) => current.filter((id) => nextLabels.some((label) => label.id === id)));
    }
  }

  const loadSegmentReferencesEffect = useEffectEvent(loadSegmentReferences);

  useEffect(() => {
    void loadEffect();
    const timer = window.setInterval(() => void loadEffect(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sessionId) void loadSegmentReferencesEffect(sessionId);
    else {
      setWhatsAppLabels([]);
      setLabelIds([]);
    }
  }, [sessionId]);

  const definition = (): SegmentDefinition => ({
    ...emptyDefinition,
    consentStatuses: consent,
    sources: splitIds(sources).map((source) => source.toUpperCase()),
    tagIds,
    labelIds,
    attributes: attributeKey.trim() ? [{ key: attributeKey.trim(), operator: "EQUALS", value: attributeValue }] : [],
  });

  const previewSegment = async () => {
    if (!sessionId) return toast.error("Pilih device terlebih dahulu");
    const response = await fetch("/api/v1/segments/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, definition: definition(), sampleLimit: 5 }) });
    const payload = await response.json() as ApiEnvelope<{ count: number }>;
    if (!response.ok || !payload.data) return toast.error(payload.error?.message || "Preview segment gagal");
    setPreviewCount(payload.data.count);
    toast.success(`${payload.data.count} kontak cocok`);
  };

  const saveSegment = async () => {
    if (!segmentName.trim()) return toast.error("Nama segment wajib diisi");
    setSaving(true);
    try {
      const response = await fetch("/api/v1/segments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: segmentName, description: segmentDescription || undefined, definition: definition() }) });
      const payload = await response.json() as ApiEnvelope<Segment>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Segment gagal disimpan");
      setSegmentId(payload.data.id);
      toast.success("Segment tersimpan dan siap dipakai");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Segment gagal disimpan"); }
    finally { setSaving(false); }
  };

  const createAndActivate = async () => {
    if (!sessionId || !segmentId || !name.trim() || !message.trim()) return toast.error("Device, segment, nama, dan pesan wajib diisi");
    setSaving(true);
    try {
      const response = await fetch("/api/v1/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ name, primarySessionId: sessionId, fallbackSessionId: fallbackSessionId || undefined, fallbackPolicy: fallbackSessionId ? "USE_FALLBACK" : "PRIMARY_ONLY", segmentId, message, mediaId: mediaId || undefined, delayMinMs: Number(delayMin) * 1000, delayMaxMs: Number(delayMax) * 1000, requireOptIn }),
      });
      const payload = await response.json() as ApiEnvelope<Campaign>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Draft campaign gagal dibuat");
      const actionResponse = await fetch(`/api/v1/campaigns/${payload.data.id}/${scheduled ? "schedule" : "launch"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: scheduled ? JSON.stringify({ localDateTime: scheduleAt, timezone }) : undefined,
      });
      const actionPayload = await actionResponse.json() as ApiEnvelope<Campaign>;
      if (!actionResponse.ok) throw new Error(actionPayload.error?.message || "Campaign gagal diaktifkan");
      toast.success(scheduled ? "Campaign dijadwalkan dengan snapshot penerima" : "Campaign masuk antrean durable");
      setName(""); setStep(1); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Campaign gagal dibuat"); }
    finally { setSaving(false); }
  };

  const act = async (campaign: Campaign, action: "pause" | "resume" | "cancel") => {
    setActionId(campaign.id);
    try {
      const response = await fetch(action === "cancel" ? `/api/v1/campaigns/${campaign.id}` : `/api/v1/campaigns/${campaign.id}/${action}`, { method: action === "cancel" ? "DELETE" : "POST" });
      const payload = await response.json() as ApiEnvelope<Campaign>;
      if (!response.ok) throw new Error(payload.error?.message || "Status campaign gagal diubah");
      toast.success(action === "pause" ? "Campaign dijeda" : action === "resume" ? "Campaign dilanjutkan" : "Campaign dibatalkan");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Status campaign gagal diubah"); }
    finally { setActionId(null); }
  };

  const exportResults = async (campaign: Campaign) => {
    const response = await fetch(`/api/v1/campaigns/${campaign.id}/export`);
    if (!response.ok) return toast.error("Export campaign gagal");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = `campaign-${campaign.id}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return <SessionGuard><div className="space-y-6">
    <div className="relative overflow-hidden rounded-2xl border bg-[var(--pp-paper)] p-6">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-teal-700">Phase 6 Campaign Studio</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Segment, kunci target, lalu kirim</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Snapshot penerima immutable, fallback device eksplisit, statistik dari queue, dan kontrol pause/resume yang tahan restart.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Sinkronkan</Button></div>
    </div>
    <Tabs defaultValue="builder"><TabsList className="grid w-full grid-cols-3 sm:w-[560px]"><TabsTrigger value="builder"><Rocket /> Builder</TabsTrigger><TabsTrigger value="segments"><Filter /> Segments</TabsTrigger><TabsTrigger value="history"><CalendarClock /> Riwayat</TabsTrigger></TabsList>
      <TabsContent value="builder" className="mt-5 space-y-5"><div className="grid grid-cols-3 gap-2">{["Target", "Pesan", "Jalankan"].map((label, index) => <button key={label} onClick={() => setStep(index + 1)} className={`rounded-xl border px-3 py-3 text-left text-sm ${step === index + 1 ? "border-teal-500 bg-teal-50 text-teal-900" : "text-muted-foreground"}`}><span className="mr-2 font-mono text-xs">0{index + 1}</span>{label}</button>)}</div>
        {step === 1 && <Card><CardHeader><CardTitle>Pilih target tersimpan</CardTitle><CardDescription>Preview segment sebelum launch. Snapshot baru dikunci saat campaign diaktifkan.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>Nama campaign</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Promo pelanggan aktif" /></div><div className="space-y-2"><Label>Segment</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={segmentId} onChange={(event) => setSegmentId(event.target.value)}><option value="">Pilih segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name} (v{segment.version})</option>)}</select></div><Button onClick={() => setStep(2)} disabled={!name || !segmentId}>Lanjut ke pesan</Button></CardContent></Card>}
        {step === 2 && <Card><CardHeader><CardTitle>Pesan dan jalur pengiriman</CardTitle><CardDescription>Device aktif dipilih dari header. Fallback opsional dipakai hanya jika primer tidak terkoneksi.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>Template pesan</Label><Textarea className="min-h-40" value={message} onChange={(event) => setMessage(event.target.value)} /></div><MediaPicker value={mediaId} onChange={setMediaId} /><div className="space-y-2"><Label>Fallback session ID</Label><Input value={fallbackSessionId} onChange={(event) => setFallbackSessionId(event.target.value)} placeholder="opsional" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Delay min (detik)</Label><Input type="number" min="2" value={delayMin} onChange={(event) => setDelayMin(event.target.value)} /></div><div className="space-y-2"><Label>Delay max (detik)</Label><Input type="number" min="2" value={delayMax} onChange={(event) => setDelayMax(event.target.value)} /></div></div><div className="flex items-center justify-between rounded-xl border p-3"><div><Label>Wajib opt-in</Label><p className="text-xs text-muted-foreground">Consent diperiksa lagi tepat sebelum enqueue.</p></div><Switch checked={requireOptIn} onCheckedChange={setRequireOptIn} /></div><Button onClick={() => setStep(3)} disabled={!message.trim()}>Review campaign</Button></CardContent></Card>}
        {step === 3 && <Card><CardHeader><CardTitle>Aktifkan dengan aman</CardTitle><CardDescription>Setelah aktif, konfigurasi dan snapshot recipient versi ini tidak dapat diedit.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-xl border bg-muted/30 p-4 text-sm"><p className="font-semibold">{name || "Campaign"}</p><p className="mt-1 text-muted-foreground">Segment: {segments.find((item) => item.id === segmentId)?.name || "-"} · delay {delayMin}-{delayMax} detik · {fallbackSessionId ? "fallback aktif" : "primer saja"}</p></div><div className="flex items-center justify-between rounded-xl border p-3"><div><Label>Jadwalkan</Label><p className="text-xs text-muted-foreground">Gunakan waktu lokal dan timezone IANA.</p></div><Switch checked={scheduled} onCheckedChange={setScheduled} /></div>{scheduled && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Waktu lokal</Label><Input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /></div><div className="space-y-2"><Label>Timezone</Label><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></div></div>}<Button onClick={() => void createAndActivate()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : scheduled ? <CalendarClock /> : <Send />} {scheduled ? "Simpan jadwal" : "Launch campaign"}</Button></CardContent></Card>}
      </TabsContent>
      <TabsContent value="segments" className="mt-5"><div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Tags className="text-teal-600" /> Segment builder</CardTitle><CardDescription>Semua filter digabung sebagai AND dan dibatasi agar query tetap aman.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Nama</Label><Input value={segmentName} onChange={(event) => setSegmentName(event.target.value)} /></div><div className="space-y-2"><Label>Sumber</Label><Input value={sources} onChange={(event) => setSources(event.target.value)} placeholder="WHATSAPP, IMPORT" /></div></div><div className="space-y-2"><Label>Deskripsi</Label><Input value={segmentDescription} onChange={(event) => setSegmentDescription(event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Contact tags</Label><div className="min-h-20 rounded-md border p-3">{contactTags.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada tag tenant yang bisa dipilih.</p> : <div className="flex flex-wrap gap-2">{contactTags.map((tag) => <Button key={tag.id} type="button" size="sm" variant={tagIds.includes(tag.id) ? "default" : "outline"} onClick={() => setTagIds((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}>{tag.name} ({tag._count.assignments})</Button>)}</div>}</div><p className="text-xs text-muted-foreground">Daftar berasal dari tenant aktif; ID asing tidak dapat disimpan.</p></div><div className="space-y-2"><Label>WhatsApp labels</Label><div className="min-h-20 rounded-md border p-3">{!sessionId ? <p className="text-sm text-muted-foreground">Pilih device terlebih dahulu.</p> : whatsAppLabels.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada label pada device ini.</p> : <div className="flex flex-wrap gap-2">{whatsAppLabels.map((label) => <Button key={label.id} type="button" size="sm" variant={labelIds.includes(label.id) ? "default" : "outline"} onClick={() => setLabelIds((current) => current.includes(label.id) ? current.filter((id) => id !== label.id) : [...current, label.id])}>{label.name} ({label._count.chatLabels})</Button>)}</div>}</div><p className="text-xs text-muted-foreground">Label dibatasi ke device yang sedang dipilih.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Custom attribute key</Label><Input value={attributeKey} onChange={(event) => setAttributeKey(event.target.value)} placeholder="kota" /></div><div className="space-y-2"><Label>Nilai harus sama</Label><Input value={attributeValue} onChange={(event) => setAttributeValue(event.target.value)} placeholder="Bandung" /></div></div><div className="flex flex-wrap gap-2">{["UNKNOWN", "OPTED_IN", "OPTED_OUT"].map((item) => <Button type="button" key={item} size="sm" variant={consent.includes(item) ? "default" : "outline"} onClick={() => setConsent((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}>{item}</Button>)}</div><div className="flex gap-2"><Button variant="outline" onClick={() => void previewSegment()}><Filter /> Preview {previewCount !== null && `(${previewCount})`}</Button><Button onClick={() => void saveSegment()} disabled={saving}><Save /> Simpan segment</Button></div></CardContent></Card><Card><CardHeader><CardTitle>Segment tersimpan</CardTitle><CardDescription>Campaign menyimpan salinan definisi dan tidak mengikuti perubahan berikutnya.</CardDescription></CardHeader><CardContent className="space-y-2">{segments.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Belum ada segment.</p> : segments.map((segment) => <button key={segment.id} onClick={() => { setSegmentId(segment.id); setStep(1); }} className="w-full rounded-xl border p-3 text-left hover:bg-muted/40"><div className="flex justify-between"><span className="font-medium">{segment.name}</span><Badge variant="outline">v{segment.version}</Badge></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{segment.description || "Tanpa deskripsi"}</p></button>)}</CardContent></Card></div></TabsContent>
      <TabsContent value="history" className="mt-5"><Card><CardHeader><CardTitle>Campaign durable</CardTitle><CardDescription>Angka diperbarui dari status broadcast dan message job tersimpan, bukan dari browser.</CardDescription></CardHeader><CardContent className="space-y-3">{campaigns.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Belum ada campaign.</p> : campaigns.map((campaign) => <div key={campaign.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{campaign.name}</p><Badge variant="outline" className={statusTone(campaign.status)}>{campaign.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{campaign.version?.segment?.name || "Segment snapshot"} · {new Date(campaign.createdAt).toLocaleString("id-ID")}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => void exportResults(campaign)}><Download /> CSV</Button>{["SCHEDULED", "QUEUED", "RUNNING"].includes(campaign.status) && <Button size="sm" variant="outline" disabled={actionId === campaign.id} onClick={() => void act(campaign, "pause")}><CirclePause /> Jeda</Button>}{["PAUSED", "FAILED"].includes(campaign.status) && <Button size="sm" variant="outline" disabled={actionId === campaign.id} onClick={() => void act(campaign, "resume")}><CirclePlay /> Lanjut</Button>}{!["COMPLETED", "CANCELLED"].includes(campaign.status) && <Button size="sm" variant="destructive" disabled={actionId === campaign.id} onClick={() => void act(campaign, "cancel")}><XCircle /> Batal</Button>}</div></div><div className="mt-4 space-y-2"><Progress value={campaign.progress.percent} /><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{campaign.progress.total} target</span><span>{campaign.progress.queued} queued</span><span>{campaign.progress.sent} sent</span><span>{campaign.progress.delivered} delivered</span><span>{campaign.progress.read} read</span><span>{campaign.progress.failed} failed</span><span>{campaign.progress.skipped} skipped</span><span>{campaign.progress.unsubscribed} unsubscribe</span></div>{campaign.error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{campaign.error.code}: {campaign.error.message}</p>}</div></div>)}</CardContent></Card></TabsContent>
    </Tabs>
  </div></SessionGuard>;
}
