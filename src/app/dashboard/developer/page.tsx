"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Code2, KeyRound, Loader2, RefreshCw, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const scopes = [
  "device:read", "device:write", "message:read", "message:send", "media:read",
  "media:write", "schedule:read", "schedule:write", "broadcast:read", "broadcast:write",
  "campaign:read", "campaign:write", "autoreply:read", "autoreply:write", "webhook:read", "webhook:write",
] as const;

interface ApiKeyItem {
  id: string;
  name: string;
  preview: string;
  scopes: string[];
  ipAllowlist: string[] | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function DeveloperPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("Production API");
  const [expiresAt, setExpiresAt] = useState("");
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([...scopes]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/user/api-keys", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load developer credentials");
      setKeys(body.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load developer credentials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createKey = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: selectedScopes,
          ipAllowlist: ipAllowlist.split(",").map((item) => item.trim()).filter(Boolean),
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create API key");
      setNewSecret(body.data.secret);
      setKeys((current) => [{ ...body.data, revokedAt: null, lastUsedAt: null }, ...current]);
      toast.success("API key created. Store the secret now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create API key");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this API key? Integrations using it will stop immediately.")) return;
    const response = await fetch(`/api/user/api-keys/${id}`, { method: "DELETE" });
    if (!response.ok) return toast.error("Unable to revoke API key");
    setKeys((current) => current.map((key) => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key));
    toast.success("API key revoked");
  };

  const rotate = async (id: string) => {
    if (!window.confirm("Rotate this API key? The previous secret will stop working immediately.")) return;
    const response = await fetch(`/api/user/api-keys/${id}/rotate`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error ?? "Unable to rotate API key");
    setNewSecret(body.data.secret);
    await load();
    toast.success("API key rotated. The previous key is no longer valid.");
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold text-[var(--pp-ink)]">Integration control</p><h1 className="text-3xl font-bold tracking-tight">Developer</h1><p className="text-muted-foreground">API keys, webhook configuration, and the minimum contract needed to integrate safely.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5 text-[var(--pp-ink)]" />Webhooks</CardTitle><CardDescription>Configure signed outbound events, subscriptions, retries, and delivery history.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href="/dashboard/webhooks">Open webhook settings</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-[var(--pp-ink)]" />Quick API contract</CardTitle><CardDescription>Use the v1 endpoints with least-privilege credentials and idempotent writes.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div><p className="font-semibold">Authentication</p><code className="mt-1 block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">Authorization: Bearer wag_••••</code></div><div><p className="font-semibold">Safe retries</p><code className="mt-1 block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">Idempotency-Key: your-unique-operation-id</code></div><p className="text-muted-foreground">Start with <code>/api/v1/messages</code>, <code>/api/v1/media</code>, and only the scopes your integration needs.</p></CardContent></Card>
      </div>

      {newSecret && <Card className="border-amber-500/40 bg-amber-500/10"><CardHeader><CardTitle>Store this secret now</CardTitle><CardDescription>It will not be displayed again after this page is closed.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row"><Input value={newSecret} readOnly className="font-mono" /><Button onClick={() => void navigator.clipboard.writeText(newSecret).then(() => toast.success("Secret copied")).catch(() => toast.error("Unable to copy secret"))}>Copy secret</Button><Button variant="ghost" onClick={() => setNewSecret(null)}>Hide</Button></CardContent></Card>}

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[var(--pp-ink)]" />Create API key</CardTitle><CardDescription>Choose the minimum permissions required by the integration.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="key-name">Name</Label><Input id="key-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={64} /></div><div className="space-y-2"><Label htmlFor="key-expiry">Expiry date (optional)</Label><Input id="key-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="key-ips">Allowed IPs (optional)</Label><Input id="key-ips" value={ipAllowlist} onChange={(event) => setIpAllowlist(event.target.value)} placeholder="203.0.113.10, 2001:db8::10" /><p className="text-xs text-muted-foreground">Comma-separated exact addresses. Leave empty to allow any IP.</p></div><div className="grid gap-2 sm:grid-cols-2">{scopes.map((scope) => <label key={scope} className="flex items-center gap-2 rounded-md border p-2 text-sm"><input type="checkbox" checked={selectedScopes.includes(scope)} onChange={(event) => setSelectedScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />{scope}</label>)}</div><Button className="w-full" disabled={submitting || selectedScopes.length === 0 || name.trim().length < 2} onClick={() => void createKey()}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Create key</Button></CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5 text-[var(--pp-ink)]" />Developer credentials</CardTitle><CardDescription>Revoked and expired keys remain visible for audit.</CardDescription></CardHeader><CardContent className="space-y-3">{keys.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Belum ada API key. Buat key pertama dengan scope minimum yang diperlukan.</p>}{keys.map((key) => <div key={key.id} className="rounded-lg border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-semibold">{key.name}</p><Badge variant={key.revokedAt ? "secondary" : "outline"}>{key.revokedAt ? "REVOKED" : "ACTIVE"}</Badge></div><p className="font-mono text-xs text-muted-foreground">{key.preview}</p><p className="mt-1 text-xs text-muted-foreground">{key.scopes.join(", ")}</p>{key.ipAllowlist && key.ipAllowlist.length > 0 && <p className="mt-1 text-xs text-muted-foreground">IPs: {key.ipAllowlist.join(", ")}</p>}</div>{!key.revokedAt && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void rotate(key.id)}><RefreshCw className="mr-2 h-3.5 w-3.5" />Rotate</Button><Button size="sm" variant="destructive" onClick={() => void revoke(key.id)}><Trash2 className="mr-2 h-3.5 w-3.5" />Revoke</Button></div>}</div></div>)}</CardContent></Card>
      </div>
    </div>
  );
}
