"use client";

import { useCallback, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Save, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatWhatsappDisplay, whatsappHref } from "@/lib/support-contact";
import { formatAccountNumberDisplay } from "@/lib/bank-list";

interface PaymentMethodsSnapshot {
    manual: { key: string; enabled: boolean; ready: boolean; label: string; missing: string[] };
    midtrans: { key: string; enabled: boolean; ready: boolean; label: string; missing: string[] };
    anyReady: boolean;
    activeManualAccountCount: number;
}

interface AccountRow {
    id: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    isActive: boolean;
    isDefault: boolean;
    usedCount: number;
}

export default function SettingsPage() {
    const { data: authSession } = useSession();
    const isSuperAdmin = authSession?.user?.role === "SUPERADMIN";

    const [systemConfig, setSystemConfig] = useState({
        appName: "PesanPro",
        logoUrl: "",
        faviconUrl: "/favicon.ico",
        timezone: "Asia/Jakarta",
        enableRegistration: true,
        manualTransferEnabled: true,
        midtransEnabled: false,
        paymentNote: "",
        supportWhatsapp: ""
    });
    const [systemLoading, setSystemLoading] = useState(false);
    const [timezones, setTimezones] = useState<string[]>(["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);
    const [pluginZip, setPluginZip] = useState<{ customUploaded: boolean; sizeBytes: number | null }>({ customUploaded: false, sizeBytes: null });
    const [pluginZipFile, setPluginZipFile] = useState<File | null>(null);
    const [pluginUploading, setPluginUploading] = useState(false);

    // Multi-bank (F1.3)
    const [accounts, setAccounts] = useState<AccountRow[]>([]);
    const [methods, setMethods] = useState<PaymentMethodsSnapshot | null>(null);
    const [bankOptions, setBankOptions] = useState<string[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [accountBusy, setAccountBusy] = useState(false);
    const [newAccount, setNewAccount] = useState({ bankName: "", accountNumber: "", accountHolder: "" });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState({ bankName: "", accountNumber: "", accountHolder: "" });
    const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);

    useEffect(() => {
        try {
            if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
                const list = Intl.supportedValuesOf("timeZone");
                if (!list.includes("UTC")) {
                    list.push("UTC");
                }
                list.sort();
                setTimezones(list);
            }
        } catch (e) {
            console.error("Failed to load timezones dynamically", e);
        }
    }, []);

    useEffect(() => {
        fetch('/api/settings/system')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setSystemConfig({
                        appName: data.appName || "PesanPro",
                        logoUrl: data.logoUrl || "",
                        faviconUrl: data.faviconUrl || "/favicon.ico",
                        timezone: data.timezone || "Asia/Jakarta",
                        enableRegistration: data.enableRegistration !== undefined ? data.enableRegistration : true,
                        manualTransferEnabled: data.manualTransferEnabled !== undefined ? data.manualTransferEnabled : true,
                        midtransEnabled: data.midtransEnabled !== undefined ? data.midtransEnabled : false,
                        paymentNote: data.paymentNote || "",
                        supportWhatsapp: data.supportWhatsapp || ""
                    });
                }
            })
            .catch(() => { });
    }, []);

    const loadAccounts = useCallback(async () => {
        setAccountsLoading(true);
        try {
            const response = await fetch("/api/admin/payment-accounts", { cache: "no-store" });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Gagal memuat daftar rekening.");
            setAccounts(body.data?.accounts ?? []);
            setMethods(body.data?.methods ?? null);
            setBankOptions(body.data?.bankOptions ?? []);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal memuat daftar rekening.");
        } finally {
            setAccountsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isSuperAdmin) return;
        void loadAccounts();
    }, [isSuperAdmin, loadAccounts]);

    useEffect(() => {
        if (!isSuperAdmin) return;
        fetch("/api/admin/plugin/wordpress")
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(body => {
                const data = body?.data;
                if (data) setPluginZip({ customUploaded: Boolean(data.customUploaded), sizeBytes: data.sizeBytes ?? null });
            })
            .catch(() => { });
    }, [isSuperAdmin]);

    const uploadPluginZip = async () => {
        if (!pluginZipFile) return;
        setPluginUploading(true);
        try {
            const form = new FormData();
            form.set("file", pluginZipFile);
            const response = await fetch("/api/admin/plugin/wordpress", { method: "POST", body: form });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.message || "Upload ZIP gagal.");
            setPluginZip({ customUploaded: true, sizeBytes: body?.data?.sizeBytes ?? pluginZipFile.size });
            setPluginZipFile(null);
            const input = document.getElementById("plugin-zip") as HTMLInputElement | null;
            if (input) input.value = "";
            toast.success(body?.message || "Paket plugin baru aktif.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload ZIP gagal.");
        } finally {
            setPluginUploading(false);
        }
    };

    const removePluginZip = async () => {
        setPluginUploading(true);
        try {
            const response = await fetch("/api/admin/plugin/wordpress", { method: "DELETE" });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.message || "Gagal menghapus unggahan.");
            setPluginZip({ customUploaded: false, sizeBytes: null });
            toast.success(body?.message || "Kembali ke plugin bawaan.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal menghapus unggahan.");
        } finally {
            setPluginUploading(false);
        }
    };

    const handleSaveSystem = async () => {
        setSystemLoading(true);
        try {
            const res = await fetch('/api/settings/system', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(systemConfig)
            });

            if (res.ok) {
                toast.success("System settings updated. Refresh to see changes.");
                await loadAccounts();
            } else {
                toast.error("Failed to update system settings");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error saving system settings");
        } finally {
            setSystemLoading(false);
        }
    };

    const createAccount = async () => {
        if (!newAccount.bankName || !newAccount.accountNumber.trim() || !newAccount.accountHolder.trim()) {
            toast.error("Lengkapi bank, nomor rekening, dan nama pemilik rekening.");
            return;
        }
        setAccountBusy(true);
        try {
            const response = await fetch("/api/admin/payment-accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newAccount, isActive: true, isDefault: accounts.length === 0 }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Gagal menambah rekening.");
            toast.success("Rekening ditambahkan.");
            setNewAccount({ bankName: "", accountNumber: "", accountHolder: "" });
            await loadAccounts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal menambah rekening.");
        } finally {
            setAccountBusy(false);
        }
    };

    const patchAccount = async (id: string, data: Record<string, unknown>) => {
        setAccountBusy(true);
        try {
            const response = await fetch(`/api/admin/payment-accounts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Gagal menyimpan perubahan rekening.");
            await loadAccounts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal menyimpan perubahan rekening.");
        } finally {
            setAccountBusy(false);
        }
    };

    const deleteAccount = async (account: AccountRow) => {
        setAccountBusy(true);
        try {
            const response = await fetch(`/api/admin/payment-accounts/${account.id}`, { method: "DELETE" });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Gagal menghapus rekening.");
            toast.success("Rekening dihapus.");
            setDeleteTarget(null);
            await loadAccounts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal menghapus rekening.");
        } finally {
            setAccountBusy(false);
        }
    };

    const moveAccount = async (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= accounts.length) return;
        const next = [...accounts];
        const [moved] = next.splice(index, 1);
        next.splice(targetIndex, 0, moved);
        setAccountBusy(true);
        try {
            const response = await fetch("/api/admin/payment-accounts/reorder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: next.map((account) => account.id) }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Gagal mengubah urutan.");
            await loadAccounts();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal mengubah urutan.");
        } finally {
            setAccountBusy(false);
        }
    };

    const startEdit = (account: AccountRow) => {
        setEditingId(account.id);
        setEditDraft({ bankName: account.bankName, accountNumber: account.accountNumber, accountHolder: account.accountHolder });
    };

    const saveEdit = async () => {
        if (!editingId) return;
        await patchAccount(editingId, editDraft);
        setEditingId(null);
    };

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    const supportHref = whatsappHref(systemConfig.supportWhatsapp, "Halo admin PesanPro, saya butuh bantuan.");
    const supportDisplay = formatWhatsappDisplay(systemConfig.supportWhatsapp);
    const supportInvalid = systemConfig.supportWhatsapp.trim().length > 0 && !supportHref;
    const bothSwitchesOff = !systemConfig.manualTransferEnabled && !systemConfig.midtransEnabled;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground text-sm mt-1">Global system configuration. Only SuperAdmins can make changes.</p>
            </div>

            {/* System Configuration (Global) */}
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-xl">App Configuration</CardTitle>
                    <CardDescription>Global settings for the application branding and access control.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Application Name</Label>
                            <input
                                className={inputClass}
                                placeholder="PesanPro"
                                value={systemConfig.appName}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, appName: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">Changes the name in the sidebar and browser title.</p>
                        </div>

                        <div className="grid gap-2">
                            <Label>Timezone</Label>
                            <select
                                className={inputClass}
                                value={systemConfig.timezone}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, timezone: e.target.value }))}
                                disabled={!isSuperAdmin}
                            >
                                {timezones.map((tz) => (
                                    <option key={tz} value={tz}>
                                        {tz}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">Scheduler will use this timezone.</p>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Logo URL</Label>
                            <input
                                className={inputClass}
                                placeholder="https://example.com/logo.png"
                                value={systemConfig.logoUrl}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, logoUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL for the main dashboard logo.</p>
                        </div>
                        <div className="grid gap-2">
                            <Label>Favicon URL</Label>
                            <input
                                className={inputClass}
                                placeholder="/favicon.ico"
                                value={systemConfig.faviconUrl}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, faviconUrl: e.target.value }))}
                                disabled={!isSuperAdmin}
                            />
                            <p className="text-xs text-muted-foreground">URL for the browser tab icon.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between space-x-2 pt-2 border-t border-border/50">
                        <Label htmlFor="enable-registration" className="flex flex-col space-y-1">
                            <span>Enable User Registration</span>
                            <span className="font-normal text-xs text-muted-foreground">Allow new users to sign up for accounts. Turn off to keep the platform private.</span>
                        </Label>
                        <Switch
                            id="enable-registration"
                            checked={systemConfig.enableRegistration}
                            onCheckedChange={c => setSystemConfig(prev => ({ ...prev, enableRegistration: c }))}
                            disabled={!isSuperAdmin}
                        />
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Configuration
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Saklar utama cara bayar (F1.4) */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Cara pembayaran</CardTitle>
                    <CardDescription>
                        Pilih cara bayar yang tersedia untuk user: Transfer Bank Manual, Midtrans, atau keduanya. Cara yang NONAKTIF tidak tampil di halaman daftar dan Tagihan.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                        <Label htmlFor="switch-manual" className="flex flex-col space-y-1">
                            <span>Transfer Bank Manual</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                User transfer ke rekening yang Anda kelola di bawah, lalu unggah bukti. Anda persetujui manual.
                            </span>
                        </Label>
                        <Switch
                            id="switch-manual"
                            checked={systemConfig.manualTransferEnabled}
                            onCheckedChange={c => setSystemConfig(prev => ({ ...prev, manualTransferEnabled: c }))}
                            disabled={!isSuperAdmin}
                        />
                    </div>
                    <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                        <Label htmlFor="switch-midtrans" className="flex flex-col space-y-1">
                            <span>Midtrans (Snap)</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                QRIS, e-wallet, VA, dan kartu lewat halaman bayar Midtrans. Konfigurasi kunci dan metode menyusul di Fase 2.
                            </span>
                        </Label>
                        <Switch
                            id="switch-midtrans"
                            checked={systemConfig.midtransEnabled}
                            onCheckedChange={c => setSystemConfig(prev => ({ ...prev, midtransEnabled: c }))}
                            disabled={!isSuperAdmin}
                        />
                    </div>

                    {bothSwitchesOff ? (
                        <p className="rounded-md border border-[var(--pp-danger)] bg-[var(--pp-paper)] px-3 py-2 text-sm font-medium text-[var(--pp-danger)]">
                            Kedua cara bayar NONAKTIF — pendaftaran dan checkout terblokir dengan pesan &quot;Pembayaran belum siap&quot;.
                        </p>
                    ) : null}

                    {/* Peringatan readiness: persis apa yang kurang per cara bayar */}
                    {methods ? (
                        <div className="space-y-2">
                            {[methods.manual, methods.midtrans].map((method) =>
                                method.enabled && !method.ready ? (
                                    <p key={method.key} className="flex items-start gap-2 rounded-md border border-[var(--pp-terracotta)] bg-[var(--pp-paper)] px-3 py-2 text-sm">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pp-terracotta)]" aria-hidden="true" />
                                        <span>{method.missing.join(" ")}</span>
                                    </p>
                                ) : null,
                            )}
                        </div>
                    ) : null}

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Payment Methods
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Daftar rekening multi-bank (F1.3) */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Rekening tujuan transfer</CardTitle>
                    <CardDescription>
                        Tampil ke user saat saklar Transfer Bank Manual AKTIF. Rekening yang pernah dipakai pembayaran tidak bisa dihapus — nonaktifkan saja supaya riwayat lama tetap bisa dicocokkan.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!systemConfig.manualTransferEnabled ? (
                        <p className="rounded-md border border-[var(--pp-terracotta)] bg-[var(--pp-paper)] px-3 py-2 text-sm">
                            Saklar Transfer Bank Manual sedang NONAKTIF: daftar ini tidak tampil ke user, tetapi tetap bisa Anda kelola di sini.
                        </p>
                    ) : null}

                    {accountsLoading ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-6 w-6 animate-spin" aria-label="Memuat rekening" />
                        </div>
                    ) : accounts.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Belum ada rekening. Transfer manual dianggap belum siap sampai ada satu rekening aktif.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {accounts.map((account, index) => (
                                <div key={account.id} className="rounded-lg border p-4">
                                    {editingId === account.id ? (
                                        <div className="grid gap-2 sm:grid-cols-3">
                                            <select
                                                className={inputClass}
                                                value={editDraft.bankName}
                                                onChange={(e) => setEditDraft((current) => ({ ...current, bankName: e.target.value }))}
                                            >
                                                <option value="">Pilih bank</option>
                                                {bankOptions.map((bank) => (
                                                    <option key={bank} value={bank}>{bank}</option>
                                                ))}
                                            </select>
                                            <Input
                                                value={editDraft.accountNumber}
                                                onChange={(e) => setEditDraft((current) => ({ ...current, accountNumber: e.target.value }))}
                                                placeholder="Nomor rekening (angka)"
                                                inputMode="numeric"
                                            />
                                            <Input
                                                value={editDraft.accountHolder}
                                                onChange={(e) => setEditDraft((current) => ({ ...current, accountHolder: e.target.value }))}
                                                placeholder="Nama pemilik rekening"
                                            />
                                            <div className="flex gap-2 sm:col-span-3">
                                                <Button size="sm" onClick={() => void saveEdit()} disabled={accountBusy}>Simpan</Button>
                                                <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={accountBusy}>Batal</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-bold">{account.bankName}</p>
                                                    {account.isDefault ? (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pp-mint)] px-2 py-0.5 text-xs font-semibold">
                                                            <Star className="h-3 w-3" aria-hidden="true" /> Utama
                                                        </span>
                                                    ) : null}
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${account.isActive ? "bg-[var(--pp-mint)]" : "bg-[var(--pp-paper)] text-muted-foreground"}`}>
                                                        {account.isActive ? "AKTIF" : "NONAKTIF"}
                                                    </span>
                                                </div>
                                                <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-extrabold tabular-nums">
                                                    {formatAccountNumberDisplay(account.accountNumber)}
                                                </p>
                                                <p className="text-sm text-muted-foreground">a.n. {account.accountHolder}</p>
                                                {account.usedCount > 0 ? (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        Sudah dipakai {account.usedCount} pembayaran — tidak bisa dihapus permanen.
                                                    </p>
                                                ) : null}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                <Button size="sm" variant="outline" disabled={accountBusy || index === 0} onClick={() => void moveAccount(index, -1)} aria-label={`Naikkan urutan ${account.bankName}`}>
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button size="sm" variant="outline" disabled={accountBusy || index === accounts.length - 1} onClick={() => void moveAccount(index, 1)} aria-label={`Turunkan urutan ${account.bankName}`}>
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                                {!account.isDefault ? (
                                                    <Button size="sm" variant="outline" disabled={accountBusy} onClick={() => void patchAccount(account.id, { isDefault: true })}>
                                                        Jadikan utama
                                                    </Button>
                                                ) : null}
                                                <Button size="sm" variant="outline" disabled={accountBusy} onClick={() => startEdit(account)}>
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={accountBusy || (account.isDefault && account.isActive)}
                                                    onClick={() => void patchAccount(account.id, { isActive: !account.isActive })}
                                                >
                                                    {account.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                </Button>
                                                {account.usedCount === 0 ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-destructive hover:text-destructive"
                                                        disabled={accountBusy}
                                                        onClick={() => setDeleteTarget(account)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tambah rekening */}
                    <div className="rounded-lg border border-dashed p-4">
                        <p className="text-sm font-semibold">Tambah rekening</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <select
                                className={inputClass}
                                value={newAccount.bankName}
                                onChange={(e) => setNewAccount((current) => ({ ...current, bankName: e.target.value }))}
                                disabled={!isSuperAdmin || accountBusy}
                                aria-label="Bank"
                            >
                                <option value="">Pilih bank</option>
                                {bankOptions.map((bank) => (
                                    <option key={bank} value={bank}>{bank}</option>
                                ))}
                            </select>
                            <Input
                                value={newAccount.accountNumber}
                                onChange={(e) => setNewAccount((current) => ({ ...current, accountNumber: e.target.value }))}
                                placeholder="Nomor rekening (6-20 angka)"
                                inputMode="numeric"
                                disabled={!isSuperAdmin || accountBusy}
                                aria-label="Nomor rekening"
                            />
                            <Input
                                value={newAccount.accountHolder}
                                onChange={(e) => setNewAccount((current) => ({ ...current, accountHolder: e.target.value }))}
                                placeholder="Nama pemilik rekening"
                                maxLength={160}
                                disabled={!isSuperAdmin || accountBusy}
                                aria-label="Nama pemilik rekening"
                            />
                        </div>
                        <Button className="mt-3" onClick={() => void createAccount()} disabled={!isSuperAdmin || accountBusy}>
                            <Plus className="mr-2 h-4 w-4" />
                            Tambah rekening
                        </Button>
                    </div>

                    <div className="grid gap-2">
                        <Label>Catatan pembayaran (opsional)</Label>
                        <textarea
                            className={`${inputClass} h-auto min-h-24 py-2`}
                            placeholder="Transfer hanya ke rekening yang tercantum. Kami tidak pernah meminta transfer ke rekening lain."
                            value={systemConfig.paymentNote}
                            onChange={(e) => setSystemConfig((prev) => ({ ...prev, paymentNote: e.target.value }))}
                            disabled={!isSuperAdmin}
                            maxLength={500}
                        />
                        <p className="text-xs text-muted-foreground">Tampil di bawah daftar rekening pada halaman pendaftaran dan Tagihan.</p>
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Catatan Pembayaran
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* WhatsApp contact shown on the dashboard Help page */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Support contact</CardTitle>
                    <CardDescription>
                        Shown on the dashboard Help page. Leave it empty to hide the WhatsApp button and tell customers that no contact is configured yet.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid max-w-md gap-2">
                        <Label>Admin WhatsApp number</Label>
                        <input
                            className={inputClass}
                            placeholder="0812-3456-7890"
                            value={systemConfig.supportWhatsapp}
                            onChange={(e) => setSystemConfig(prev => ({ ...prev, supportWhatsapp: e.target.value }))}
                            disabled={!isSuperAdmin}
                            maxLength={40}
                        />
                        <p className="text-xs text-muted-foreground">
                            Any format works: 0812..., +62 812..., or 62812.... The number is converted to the international form automatically.
                        </p>
                        {supportInvalid ? (
                            <p className="text-xs text-[var(--pp-danger)]">That number cannot be converted. Use digits, spaces, +, -, or parentheses.</p>
                        ) : null}
                        {supportHref ? (
                            <a
                                href={supportHref}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold underline underline-offset-4"
                            >
                                Preview: chat {supportDisplay}
                            </a>
                        ) : null}
                    </div>

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Support Contact
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* WordPress plugin archive served to every user download */}
            {isSuperAdmin ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Plugin WordPress (ZIP)</CardTitle>
                        <CardDescription>
                            The archive behind the Unduh ZIP plugin button on the Developer page. Upload a newer build here to ship it without touching the server code; remove the upload to fall back to the plugin bundled with the app.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {pluginZip.customUploaded
                                ? `Custom upload aktif (${pluginZip.sizeBytes ? formatBytes(pluginZip.sizeBytes) : "ukuran tidak diketahui"}).`
                                : "Belum ada unggahan khusus. Unduhan memakai plugin bawaan aplikasi."}
                        </p>
                        <div className="grid max-w-md gap-2">
                            <Label htmlFor="plugin-zip">Berkas ZIP plugin</Label>
                            <input
                                id="plugin-zip"
                                type="file"
                                accept=".zip,application/zip,application/x-zip-compressed"
                                className={inputClass}
                                onChange={(e) => setPluginZipFile(e.target.files?.[0] ?? null)}
                                disabled={pluginUploading}
                            />
                            <p className="text-xs text-muted-foreground">Maksimal 10 MB. Pastikan ZIP berisi folder pesanpro-contact-form-7.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => void uploadPluginZip()} disabled={pluginUploading || !pluginZipFile}>
                                {pluginUploading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Upload ZIP
                            </Button>
                            <Button variant="outline" onClick={() => void removePluginZip()} disabled={pluginUploading || !pluginZip.customUploaded}>
                                Kembalikan ke bawaan
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {/* Konfirmasi hapus rekening: hanya untuk rekening yang belum pernah dipakai */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !accountBusy && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus rekening {deleteTarget?.bankName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Rekening ini belum pernah dipakai pembayaran, jadi boleh dihapus permanen. Kalau nanti sudah pernah dipakai, nonaktifkan saja — jangan dihapus.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={accountBusy}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={accountBusy}
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => deleteTarget && void deleteAccount(deleteTarget)}
                        >
                            Hapus permanen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
