"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const integrationTypes = [
  { value: "CONTACT_FORM_7", label: "Contact Form 7", hint: "Notifikasi dari form Contact Form 7 (plugin WordPress)." },
  { value: "GOOGLE_FORMS", label: "Google Forms", hint: "Notifikasi dari Google Forms via Apps Script." },
  { value: "WOOCOMMERCE", label: "WooCommerce", hint: "Notifikasi status pesanan WooCommerce." },
  { value: "WORDPRESS", label: "WordPress (form kustom)", hint: "Form WordPress lain lewat REST endpoint." },
] as const;

type IntegrationTypeValue = (typeof integrationTypes)[number]["value"];

function typeLabel(value: string) {
  return integrationTypes.find((item) => item.value === value)?.label ?? value;
}

interface DeviceItem {
  sessionId: string;
  name: string;
}

interface TokenItem {
  id: string;
  name: string;
  type: string;
  tokenPreview: string;
  sessionPublicId?: string | null;
  sessionName?: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

// Pesan dalam bahasa Indonesia untuk setiap kode error dari API v1 supaya
// user awam tahu langkah berikutnya, bukan hanya "terjadi kesalahan".
function toIndonesianError(code: string, message: string, details: unknown): string {
  switch (code) {
    case "VALIDATION_ERROR": {
      if (Array.isArray(details) && details.length > 0) {
        const fieldMap: Record<string, string> = {
          name: "Nama",
          type: "Tipe integrasi",
          sessionId: "Perangkat WhatsApp",
          "mapping.staticRecipient": "Nomor tetap",
          "mapping.recipientField": "Field penerima",
          "mapping.messageTemplate": "Template pesan",
          expiresAt: "Tanggal kedaluwarsa",
        };
        const items = (details as Array<{ path: string; message: string }>).map(
          (item) => `${fieldMap[item.path] ?? item.path}: ${item.message}`,
        );
        return `Input belum valid — ${items.join("; ")}.`;
      }
      return "Input belum valid. Periksa kembali isian form.";
    }
    case "SESSION_NOT_FOUND":
    case "SESSION_FORBIDDEN":
      return "Perangkat WhatsApp tidak ditemukan atau bukan milik akun Anda. Pilih perangkat dari daftar di form.";
    case "TENANT_NOT_FOUND":
      return "Akun billing tidak ditemukan. Hubungi admin.";
    case "ENTITLEMENT_DENIED":
      return "Paket Anda tidak mencakup fitur ini. Cek langganan di menu Tagihan, lalu upgrade bila perlu.";
    case "INTEGRATION_TOKEN_NOT_FOUND":
      return "Token sudah tidak ada atau sudah dicabut sebelumnya.";
    case "UNAUTHORIZED":
      return "Sesi login berakhir. Muat ulang halaman untuk login ulang.";
    default:
      return message || "Terjadi kesalahan. Coba lagi.";
  }
}

export default function IntegrationsPage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [name, setName] = useState("Notifikasi Contact Form 7");
  const [type, setType] = useState<IntegrationTypeValue | "">("");
  const [sessionId, setSessionId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [staticRecipient, setStaticRecipient] = useState("");
  const [recipientField, setRecipientField] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tokenRes, deviceRes] = await Promise.all([
        fetch("/api/v1/integration-tokens", { cache: "no-store" }),
        fetch("/api/sessions", { cache: "no-store" }),
      ]);
      const tokenBody = await tokenRes.json();
      if (!tokenRes.ok) {
        const err = tokenBody.error ?? {};
        throw new Error(toIndonesianError(err.code ?? "", err.message ?? "Unable to load tokens", err.details));
      }
      setTokens(tokenBody.data ?? []);
      const deviceBody = await deviceRes.json();
      if (deviceRes.ok && deviceBody.status) {
        const list: DeviceItem[] = (deviceBody.data ?? []).map((item: { sessionId: string; name: string }) => ({
          sessionId: item.sessionId,
          name: item.name,
        }));
        setDevices(list);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal memuat data token integrasi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createToken = async () => {
    setSubmitting(true);
    try {
      const mapping: Record<string, string> = {};
      if (staticRecipient.trim()) mapping.staticRecipient = staticRecipient.trim();
      if (recipientField.trim()) mapping.recipientField = recipientField.trim();
      if (messageTemplate.trim()) mapping.messageTemplate = messageTemplate.trim();
      const response = await fetch("/api/v1/integration-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          sessionId,
          mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const err = body.error ?? {};
        throw new Error(toIndonesianError(err.code ?? "", err.message ?? "Unable to create token", err.details));
      }
      setNewSecret(body.data.secret);
      setTokens((current) => [body.data.token, ...current]);
      toast.success("Token integrasi dibuat. Salin secret sekarang — hanya ditampilkan sekali.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuat token integrasi");
    } finally {
      setSubmitting(false);
    }
  };

  const revokeToken = async (id: string) => {
    if (!window.confirm("Cabut token ini? Integrasi yang memakainya langsung berhenti mengirim pesan.")) return;
    setRevokingId(id);
    try {
      const response = await fetch(`/api/v1/integration-tokens/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) {
        const err = body.error ?? {};
        throw new Error(toIndonesianError(err.code ?? "", err.message ?? "Unable to revoke token", err.details));
      }
      setTokens((current) => current.map((token) => token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token));
      toast.success("Token dicabut. Secret lama tidak bisa dipakai lagi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mencabut token");
    } finally {
      setRevokingId(null);
    }
  };

  const copySecret = () => {
    if (!newSecret) return;
    void navigator.clipboard.writeText(newSecret)
      .then(() => toast.success("Secret tersalin ke clipboard"))
      .catch(() => toast.error("Gagal menyalin. Salin manual dari kolom di bawah."));
  };

  const canSubmit = !submitting && type !== "" && sessionId !== "" && name.trim().length >= 2;

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--pp-ink)]">Integrasi tanpa kode</p>
          <h1 className="text-3xl font-bold tracking-tight">Token Integrasi</h1>
          <p className="text-muted-foreground">Hubungkan Contact Form 7, Google Forms, WooCommerce, dan form WordPress ke perangkat WhatsApp Anda.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-[var(--pp-ink)]" />Integration token vs API key</CardTitle>
          <CardDescription>Keduanya tidak saling menggantikan. Pakai yang sesuai dengan kebutuhan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="font-semibold">Integration token <code className="text-xs">ppint_...</code></p>
            <p className="mt-1 text-muted-foreground">Untuk plugin dan konektor tanpa kode. Terikat ke satu perangkat WhatsApp, hanya boleh mengirim pesan, dan dipakai plugin Contact Form 7. Dibuat di halaman ini.</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-semibold">API key <code className="text-xs">wag_...</code></p>
            <p className="mt-1 text-muted-foreground">Untuk programmer yang memanggil REST API lengkap dengan scope pilihan. Dibuat di menu <Link className="underline" href="/dashboard/developer">Kunci API</Link>. Tidak diterima oleh plugin Contact Form 7.</p>
          </div>
        </CardContent>
      </Card>

      {newSecret && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardHeader>
            <CardTitle>Salin secret sekarang</CardTitle>
            <CardDescription>Secret ini hanya ditampilkan sekali. Setelah halaman ini ditutup atau Anda menekan Sembunyikan, secret tidak bisa dilihat lagi — hanya preview yang tersisa. Kalau hilang, buat token baru lalu cabut yang lama.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input value={newSecret} readOnly className="font-mono" />
            <Button onClick={copySecret}><Copy className="mr-2 h-4 w-4" />Salin secret</Button>
            <Button variant="ghost" onClick={() => setNewSecret(null)}>Sembunyikan</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Buat token integrasi</CardTitle>
            <CardDescription>Token terikat ke satu perangkat WhatsApp dan hanya boleh mengirim pesan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Nama</Label>
              <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Contoh: Notifikasi form toko" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-type">Tipe integrasi</Label>
              <Select value={type} onValueChange={(value) => setType(value as IntegrationTypeValue)}>
                <SelectTrigger id="token-type" className="w-full"><SelectValue placeholder="Pilih tipe integrasi" /></SelectTrigger>
                <SelectContent>
                  {integrationTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {type && <p className="text-xs text-muted-foreground">{integrationTypes.find((item) => item.value === type)?.hint}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-device">Perangkat WhatsApp</Label>
              {devices.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Belum ada perangkat. Tambahkan perangkat dulu di menu <Link className="underline" href="/dashboard/sessions">Perangkat &amp; QR</Link>.</p>
              ) : (
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger id="token-device" className="w-full"><SelectValue placeholder="Pilih perangkat pengirim" /></SelectTrigger>
                  <SelectContent>
                    {devices.map((device) => <SelectItem key={device.sessionId} value={device.sessionId}>{device.name} ({device.sessionId})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">Hanya perangkat milik akun Anda yang muncul di daftar ini.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-expiry">Tanggal kedaluwarsa (opsional)</Label>
              <Input id="token-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
              <p className="text-xs text-muted-foreground">Kosongkan supaya token aktif selamanya sampai dicabut.</p>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">Mapping (opsional)</p>
              <div className="space-y-2">
                <Label htmlFor="token-static">Nomor tetap (staticRecipient)</Label>
                <Input id="token-static" value={staticRecipient} onChange={(event) => setStaticRecipient(event.target.value)} placeholder="628123456789" />
                <p className="text-xs text-muted-foreground">Semua pesan dikirim ke nomor ini, misalnya nomor admin. Menang atas field penerima.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="token-recipient-field">Field penerima (recipientField)</Label>
                <Input id="token-recipient-field" value={recipientField} onChange={(event) => setRecipientField(event.target.value)} placeholder="whatsapp" />
                <p className="text-xs text-muted-foreground">Nama field form yang berisi nomor WhatsApp pengisi form.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="token-template">Template pesan (messageTemplate)</Label>
                <Textarea id="token-template" value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} rows={3} placeholder="Pesan baru dari {{field:nama}}: {{message}}" />
                <p className="text-xs text-muted-foreground">Placeholder: {"{{message}}"}, {"{{sourceId}}"}, {"{{field:nama_field}}"}. Kosongkan untuk pesan asli dari integrasi.</p>
              </div>
            </div>
            <Button className="w-full" disabled={!canSubmit} onClick={() => void createToken()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitting ? "Membuat token..." : "Buat token"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar token</CardTitle>
            <CardDescription>Token yang dicabut tetap tampil untuk audit, dengan status REVOKED.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tokens.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Belum ada token integrasi. Buat token pertama dengan form di samping.</p>}
            {tokens.map((token) => (
              <div key={token.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{token.name}</p>
                      <Badge variant={token.revokedAt ? "secondary" : "outline"}>{token.revokedAt ? "REVOKED" : "ACTIVE"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Tipe: {typeLabel(token.type)}</p>
                    <p className="text-xs text-muted-foreground">Perangkat: {token.sessionName ?? "-"}{token.sessionPublicId ? ` (${token.sessionPublicId})` : ""}</p>
                    <p className="font-mono text-xs text-muted-foreground">{token.tokenPreview}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Dibuat: {formatDate(token.createdAt)}</p>
                    <p className="text-xs text-muted-foreground">Terakhir dipakai: {formatDate(token.lastUsedAt)}</p>
                    {token.expiresAt && <p className="text-xs text-muted-foreground">Kedaluwarsa: {formatDate(token.expiresAt)}</p>}
                  </div>
                  {!token.revokedAt && (
                    <Button size="sm" variant="destructive" disabled={revokingId === token.id} onClick={() => void revokeToken(token.id)}>
                      {revokingId === token.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                      Cabut
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
