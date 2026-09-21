"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Copy, RefreshCw, Webhook, Key, Eye, EyeOff, Play, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { SessionGuard } from "@/components/dashboard/session-guard";
import WebhookLogDialog from "@/components/dashboard/webhook-log-dialog";

interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    hasSecret: boolean;
    secretVersion: number;
    previousSecretExpiresAt?: string | null;
    sessionId?: string;
    events: string[];
    isActive: boolean;
    createdAt: string;
}

interface ApiKeyState {
    createdAt: string | null;
    hasApiKey: boolean;
    preview: string | null;
    secret: string | null;
}

interface WebhookMutationPayload {
    events: string[];
    name: string;
    secret?: string;
    url: string;
}

interface WebhookResponseBody {
    data?: WebhookConfig[];
}

interface WebhookMutationResponseBody {
    data?: WebhookConfig;
    message?: string;
    secret?: string;
}

interface ApiKeyResponseBody {
    data?: {
        apiKey?: string | null;
        createdAt?: string | null;
        hasApiKey?: boolean;
        preview?: string | null;
    };
}

interface WebhookTestResult {
    deliveryId?: string;
    error?: string;
    responseBody?: string;
    responseTimeMs?: number;
    statusCode?: number;
    success?: boolean;
    testing?: boolean;
}

interface WebhookTestResponseBody {
    data?: WebhookTestResult;
}

const AVAILABLE_EVENTS = [
    { id: "message.received", label: "Message Received", description: "When a new message is received" },
    { id: "message.sent", label: "Message Sent", description: "When a message is sent" },
    { id: "message.status", label: "Message Status", description: "When message status changes (delivered, read)" },
    { id: "connection.update", label: "Connection Update", description: "When session connects/disconnects" },
    { id: "group.update", label: "Group Update", description: "When group info changes" },
    { id: "group.participant", label: "Group Member", description: "When participants join, leave, or change roles" },
    { id: "contact.update", label: "Contact Update", description: "When contact info changes" },
    { id: "status.update", label: "Status/Story", description: "When a status is posted or viewed" },
    { id: "message.edited", label: "Message Edited", description: "When a message is edited" },
    { id: "message.deleted", label: "Message Deleted", description: "When a message is revoked/deleted" },
    { id: "schedule.status", label: "Schedule Status", description: "When a durable schedule reaches a new state" },
    { id: "broadcast.status", label: "Broadcast Status", description: "When a broadcast completes or fails" },
    { id: "campaign.status", label: "Campaign Status", description: "When a campaign reaches a new state" },
];

import { useSession } from "@/components/dashboard/session-provider";

export default function WebhooksPage() {
    const { sessionId, sessions } = useSession();
    const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
    const [apiKeyState, setApiKeyState] = useState<ApiKeyState>({
        createdAt: null,
        hasApiKey: false,
        preview: null,
        secret: null,
    });
    const [showApiKey, setShowApiKey] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showRegenConfirm, setShowRegenConfirm] = useState(false);
    const [oneTimeSecret, setOneTimeSecret] = useState<{ name: string; secret: string } | null>(null);

    // New webhook form
    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [newSecret, setNewSecret] = useState("");
    const [newEvents, setNewEvents] = useState<string[]>(["message.received", "message.sent"]);

    // Testing state
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, WebhookTestResult>>({});

    // Log viewer state
    const [logDialogId, setLogDialogId] = useState<string | null>(null);
    const [logDialogName, setLogDialogName] = useState("");
    const [logDialogSessionId, setLogDialogSessionId] = useState("");

    const fetchWebhooks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/webhooks/${sessionId}`);
            if (res.ok) {
                const responseData = await res.json() as WebhookResponseBody;
                const data = responseData?.data || [];
                const currentSession = sessions.find(s => s.sessionId === sessionId);
                const currentSessionCuid = currentSession?.id;

                const filtered = data.filter((w: WebhookConfig) =>
                    w.sessionId === sessionId ||
                    w.sessionId === currentSessionCuid ||
                    !w.sessionId
                );
                setWebhooks(filtered);
            }
        } catch (error) {
            console.error("Failed to fetch webhooks", error);
        } finally {
            setLoading(false);
        }
    }, [sessionId, sessions]);

    const fetchApiKey = useCallback(async () => {
        try {
            const res = await fetch("/api/user/api-key");
            if (res.ok) {
                const data = await res.json() as ApiKeyResponseBody;
                setApiKeyState({
                    createdAt: data?.data?.createdAt ?? null,
                    hasApiKey: !!data?.data?.hasApiKey,
                    preview: data?.data?.preview ?? null,
                    secret: null,
                });
                setShowApiKey(false);
            }
        } catch (error) {
            console.error("Failed to fetch API key", error);
        }
    }, []);

    useEffect(() => {
        if (sessions.length > 0) {
            void fetchWebhooks();
        }
        void fetchApiKey();
    }, [fetchApiKey, fetchWebhooks, sessionId, sessions]);

    const generateNewApiKey = async () => {
        try {
            const res = await fetch("/api/user/api-key", { method: "POST" });
            if (res.ok) {
                const data = await res.json() as ApiKeyResponseBody;
                setApiKeyState({
                    createdAt: data?.data?.createdAt ?? null,
                    hasApiKey: true,
                    preview: data?.data?.preview ?? null,
                    secret: data?.data?.apiKey ?? null,
                });
                setShowApiKey(true);
                toast.success("New API key generated!");
            }
        } catch {
            toast.error("Failed to generate API key");
        }
    };

    const handleTestWebhook = async (webhook: WebhookConfig) => {
        setTestingId(webhook.id);
        setTestResults(prev => ({ ...prev, [webhook.id]: { testing: true } }));
        try {
            const targetSessionId = webhook.sessionId || sessionId;
            const res = await fetch(`/api/webhooks/${targetSessionId}/${webhook.id}/test`, { method: "POST" });
            const data = await res.json() as WebhookTestResponseBody;
            setTestResults(prev => ({ ...prev, [webhook.id]: data?.data || { success: false, error: "No response" } }));
            if (data?.data?.success) {
                toast.success("Webhook test successful!");
            } else {
                toast.error(`Webhook test failed: ${data?.data?.error || "Unknown error"}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            setTestResults(prev => ({ ...prev, [webhook.id]: { success: false, error: message } }));
            toast.error("Failed to test webhook");
        } finally {
            setTestingId(null);
        }
    };

    const openLogDialog = (webhook: WebhookConfig) => {
        const targetSessionId = webhook.sessionId || sessionId || "";
        setLogDialogId(webhook.id);
        setLogDialogName(webhook.name);
        setLogDialogSessionId(targetSessionId);
    };

    const closeLogDialog = () => {
        setLogDialogId(null);
        setLogDialogName("");
        setLogDialogSessionId("");
    };

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [editUrl, setEditUrl] = useState("");
    const [editEvents, setEditEvents] = useState<string[]>([]);

    const handleEdit = (webhook: WebhookConfig) => {
        setEditingId(webhook.id);
        setEditName(webhook.name);
        setEditUrl(webhook.url);
        setEditEvents(webhook.events);
        setIsEditOpen(true);
    };

    const handleSaveWebhook = async () => {
        if (!newName || !newUrl || newEvents.length === 0) {
            toast.error("Name, URL, and at least one event are required");
            return;
        }
        if (!sessionId) {
            toast.error("No active session selected");
            return;
        }
        try {
            const payload: WebhookMutationPayload = { name: newName, url: newUrl, events: newEvents };
            if (newSecret) payload.secret = newSecret;
            const res = await fetch(`/api/webhooks/${sessionId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const response = await res.json() as WebhookMutationResponseBody;
                if (response.secret) setOneTimeSecret({ name: newName, secret: response.secret });
                toast.success("Webhook created. Store the signing secret now.");
                setShowNewForm(false);
                setNewName("");
                setNewUrl("");
                setNewSecret("");
                setNewEvents(["message.received", "message.sent"]);
                fetchWebhooks();
            } else {
                toast.error("Failed to create webhook");
            }
        } catch {
            toast.error("An error occurred");
        }
    };

    const handleUpdateWebhook = async () => {
        if (!editName || !editUrl || editEvents.length === 0) {
            toast.error("Name, URL, and at least one event are required");
            return;
        }
        if (!sessionId || !editingId) return;
        try {
            const webhook = webhooks.find(w => w.id === editingId);
            const targetSessionId = webhook?.sessionId || sessionId;
            const payload: WebhookMutationPayload = { name: editName, url: editUrl, events: editEvents };
            const res = await fetch(`/api/webhooks/${targetSessionId}/${editingId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success("Webhook updated!");
                setIsEditOpen(false);
                setEditingId(null);
                fetchWebhooks();
            } else {
                toast.error("Failed to update webhook");
            }
        } catch {
            toast.error("An error occurred");
        }
    };

    const rotateSecret = async (webhook: WebhookConfig) => {
        const targetSessionId = webhook.sessionId || sessionId;
        try {
            const res = await fetch(`/api/webhooks/${targetSessionId}/${webhook.id}/rotate-secret`, { method: "POST" });
            const response = await res.json() as WebhookMutationResponseBody;
            if (!res.ok || !response.secret) throw new Error(response.message || "Secret rotation failed");
            setOneTimeSecret({ name: webhook.name, secret: response.secret });
            toast.success("Signing secret rotated. The previous signature remains available for 24 hours.");
            void fetchWebhooks();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to rotate secret");
        }
    };

    const toggleWebhookActive = async (id: string, isActive: boolean) => {
        try {
            const webhook = webhooks.find(w => w.id === id);
            const targetSessionId = webhook?.sessionId || sessionId;
            const response = await fetch(`/api/webhooks/${targetSessionId}/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive })
            });
            if (!response.ok) throw new Error("Webhook state update was rejected");
            setWebhooks(webhooks.map(w => w.id === id ? { ...w, isActive } : w));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update webhook");
        }
    };

    const toggleEventForWebhook = async (webhookId: string, eventId: string) => {
        const webhook = webhooks.find(w => w.id === webhookId);
        if (!webhook) return;
        const newEvents = webhook.events.includes(eventId)
            ? webhook.events.filter(e => e !== eventId)
            : [...webhook.events, eventId];
        if (newEvents.length === 0) {
            toast.error("At least one event subscription is required");
            return;
        }
        const targetSessionId = webhook.sessionId || sessionId;
        try {
            const response = await fetch(`/api/webhooks/${targetSessionId}/${webhookId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ events: newEvents })
            });
            if (!response.ok) throw new Error("Event subscription update was rejected");
            setWebhooks(webhooks.map(w => w.id === webhookId ? { ...w, events: newEvents } : w));
        } catch {
            toast.error("Failed to update webhook events");
        }
    };

    const [deleteId, setDeleteId] = useState<string | null>(null);

    const deleteWebhook = async (id: string) => {
        setDeleteId(id);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            const webhook = webhooks.find(w => w.id === deleteId);
            const targetSessionId = webhook?.sessionId || sessionId;
            await fetch(`/api/webhooks/${targetSessionId}/${deleteId}`, { method: "DELETE" });
            setWebhooks(webhooks.filter(w => w.id !== deleteId));
            toast.success("Webhook deleted");
        } catch {
            toast.error("Failed to delete webhook");
        } finally {
            setDeleteId(null);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard!");
    };

    const apiKeyDisplayValue = apiKeyState.secret
        ? (showApiKey ? apiKeyState.secret : "••••••••••••••••••••••••••••••••")
        : apiKeyState.hasApiKey
            ? (apiKeyState.preview ?? "Existing API key stored securely")
            : null;
    const apiKeyExample = `curl -H "X-API-Key: ${apiKeyState.secret ? `${apiKeyState.secret.slice(0, 10)}...` : (apiKeyState.preview ?? "wag_xxxx...yyyy")}" http://your-server/api/sessions`;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold">Webhooks & API</h1>
            </div>

            {/* API Key Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5" /> API Key
                    </CardTitle>
                    <CardDescription>
                        Use this key to authenticate API requests. The full secret is only shown once when you generate or regenerate it.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                        <div className="flex-1 bg-slate-100 rounded-md p-2 sm:p-3 font-mono text-xs sm:text-sm overflow-x-auto">
                            {apiKeyDisplayValue ? (
                                apiKeyDisplayValue
                            ) : (
                                <span className="text-muted-foreground">No API key generated</span>
                            )}
                        </div>
                        {apiKeyState.secret && (
                            <>
                                <Button variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        if (apiKeyState.secret) {
                                            copyToClipboard(apiKeyState.secret);
                                        }
                                    }}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                        <Button onClick={() => {
                            if (apiKeyState.hasApiKey) setShowRegenConfirm(true);
                            else generateNewApiKey();
                        }}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {apiKeyState.hasApiKey ? "Regenerate" : "Generate"}
                        </Button>
                    </div>
                    {apiKeyState.hasApiKey && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Example: <code className="bg-slate-100 px-1 py-0.5 rounded">{apiKeyExample}</code>
                        </p>
                    )}
                    {apiKeyState.hasApiKey && !apiKeyState.secret && (
                        <p className="text-xs text-amber-700 mt-2">
                            Existing secrets cannot be revealed again. Regenerate the key if you need a new full secret.
                        </p>
                    )}
                    {apiKeyState.createdAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Last generated: {new Date(apiKeyState.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                        </p>
                    )}
                </CardContent>

                <AlertDialog open={showRegenConfirm} onOpenChange={setShowRegenConfirm}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will invalidate your current API key. All existing integrations using the old key will stop working immediately. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => { setShowRegenConfirm(false); generateNewApiKey(); }} className="bg-red-600 hover:bg-red-700">Regenerate</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </Card>

            {/* Webhooks Section */}
            <SessionGuard>
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Webhook className="h-5 w-5" /> Webhooks
                                </CardTitle>
                                <CardDescription>
                                    Send real-time events to external URLs when activities happen in WhatsApp.
                                </CardDescription>
                            </div>
                            <Button onClick={() => {
                                setNewName("");
                                setNewUrl("");
                                setNewSecret("");
                                setNewEvents(["message.received", "message.sent"]);
                                setShowNewForm(!showNewForm);
                            }}>
                                <Plus className="h-4 w-4 mr-2" /> Add Webhook
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {oneTimeSecret && (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold">Signing secret for {oneTimeSecret.name}</p>
                                        <p className="text-xs">Shown once. Store it in your receiver secret manager before closing this notice.</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setOneTimeSecret(null)}>Hide permanently</Button>
                                </div>
                                <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-3 font-mono text-xs break-all">
                                    <span className="flex-1 select-all">{oneTimeSecret.secret}</span>
                                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(oneTimeSecret.secret)}><Copy className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        )}
                        {showNewForm && (
                            <Card className="border-dashed border-2">
                                <CardHeader><CardTitle>New Webhook</CardTitle></CardHeader>
                                <CardContent className="pt-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Name</Label>
                                            <Input placeholder="My Server" value={newName} onChange={(e) => setNewName(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Webhook URL</Label>
                                            <Input placeholder="https://example.com/webhook" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Secret (optional, for HMAC signature)</Label>
                                        <Input placeholder="your-secret-key" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Events</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {AVAILABLE_EVENTS.map(event => (
                                                <div key={event.id} className="flex items-center gap-2 p-2 rounded border">
                                                    <Switch
                                                        checked={newEvents.includes(event.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) setNewEvents([...newEvents, event.id]);
                                                            else setNewEvents(newEvents.filter(e => e !== event.id));
                                                        }}
                                                    />
                                                    <div>
                                                        <p className="text-sm font-medium">{event.label}</p>
                                                        <p className="text-xs text-muted-foreground">{event.description}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Button variant="ghost" onClick={() => setShowNewForm(false)}>Cancel</Button>
                                        <Button onClick={handleSaveWebhook}>Create Webhook</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {loading ? (
                            <p className="text-center text-muted-foreground py-8">Loading...</p>
                        ) : webhooks.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                                No webhooks configured for this session. Use the Add Webhook button to create one.
                            </p>
                        ) : (
                            webhooks.map((webhook) => {
                                const isTesting = testingId === webhook.id;
                                const testResult = testResults[webhook.id];

                                return (
                                    <Card key={webhook.id} className={webhook.isActive ? "" : "opacity-60"}>
                                        <CardContent className="pt-4 space-y-3">
                                            {/* Header */}
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-semibold flex items-center gap-2">
                                                        {webhook.name}
                                                        <Badge variant={webhook.isActive ? "default" : "secondary"}>
                                                            {webhook.isActive ? "Active" : "Inactive"}
                                                        </Badge>
                                                        {webhook.sessionId && (
                                                            <Badge variant="outline" className="text-xs">{webhook.sessionId}</Badge>
                                                        )}
                                                    </h3>
                                                    <p className="text-sm text-muted-foreground font-mono">{webhook.url}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Switch
                                                        checked={webhook.isActive}
                                                        onCheckedChange={(checked) => toggleWebhookActive(webhook.id, checked)}
                                                    />
                                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(webhook)}>Edit</Button>
                                                    <Button variant="ghost" size="icon" title="Rotate signing secret" onClick={() => rotateSecret(webhook)}>
                                                        <Key className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => deleteWebhook(webhook.id)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Event Toggles */}
                                            <div className="space-y-2">
                                                <Label className="text-xs">Events (click to toggle)</Label>
                                                <div className="flex flex-wrap gap-2">
                                                    {AVAILABLE_EVENTS.map(event => (
                                                        <Badge
                                                            key={event.id}
                                                            variant={webhook.events.includes(event.id) ? "default" : "outline"}
                                                            className="cursor-pointer"
                                                            onClick={() => toggleEventForWebhook(webhook.id, event.id)}
                                                        >
                                                            {event.label}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Test & Logs Buttons */}
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleTestWebhook(webhook)}
                                                    disabled={isTesting}
                                                >
                                                    {isTesting ? (
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                    ) : (
                                                        <Play className="h-4 w-4 mr-1" />
                                                    )}
                                                    Test
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openLogDialog(webhook)}
                                                >
                                                    <History className="h-4 w-4 mr-1" />
                                                    Logs
                                                </Button>
                                                <span className="text-xs text-muted-foreground">Secret v{webhook.secretVersion}</span>
                                            </div>

                                            {/* Test Result */}
                                            {testResult && !testResult.testing && (
                                                <div className={`p-3 rounded-md text-sm font-mono whitespace-pre-wrap ${
                                                    testResult.success
                                                        ? "bg-green-50 border border-green-200 text-green-800"
                                                        : "bg-red-50 border border-red-200 text-red-800"
                                                }`}>
                                                    <div className="flex items-center gap-2 mb-1 font-semibold">
                                                        {testResult.success ? "Queued safely" : "Failed"}
                                                        <span className="text-xs font-normal text-muted-foreground">
                                                            {testResult.responseTimeMs}ms
                                                        </span>
                                                    </div>
                                                    {testResult.statusCode && (
                                                        <div>Status: {testResult.statusCode}</div>
                                                    )}
                                                    {testResult.error && (
                                                        <div>Error: {testResult.error}</div>
                                                    )}
                                                    {testResult.responseBody && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer text-xs">Response Body</summary>
                                                            <pre className="mt-1 text-xs overflow-x-auto">{testResult.responseBody}</pre>
                                                        </details>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })
                        )}
                    </CardContent>
                </Card>
            </SessionGuard>

            {/* Edit Webhook Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Webhook</DialogTitle>
                        <DialogDescription>Modify the webhook endpoint configuration and subscribed events.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input placeholder="My Server" value={editName} onChange={(e) => setEditName(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Webhook URL</Label>
                                <Input placeholder="https://example.com/webhook" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Signing secret</Label>
                            <p className="text-xs text-muted-foreground">Secrets cannot be revealed or edited here. Use the key button on the endpoint card to rotate it with a 24-hour transition signature.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Events</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {AVAILABLE_EVENTS.map(event => (
                                    <div key={event.id} className="flex items-center gap-2 p-2 rounded border">
                                        <Switch
                                            checked={editEvents.includes(event.id)}
                                            onCheckedChange={(checked) => {
                                                if (checked) setEditEvents([...editEvents, event.id]);
                                                else setEditEvents(editEvents.filter(e => e !== event.id));
                                            }}
                                        />
                                        <div>
                                            <p className="text-sm font-medium">{event.label}</p>
                                            <p className="text-xs text-muted-foreground">{event.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdateWebhook}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the webhook configuration.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Webhook Log Dialog */}
            {logDialogId && (
                <WebhookLogDialog
                    webhookId={logDialogId}
                    webhookName={logDialogName}
                    targetSessionId={logDialogSessionId}
                    open={!!logDialogId}
                    onClose={closeLogDialog}
                />
            )}
        </div>
    );
}
