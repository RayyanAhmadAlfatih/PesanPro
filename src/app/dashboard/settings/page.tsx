"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { formatWhatsappDisplay, whatsappHref } from "@/lib/support-contact";

export default function SettingsPage() {
    const { data: authSession } = useSession();
    const isSuperAdmin = authSession?.user?.role === "SUPERADMIN";

    const [systemConfig, setSystemConfig] = useState({
        appName: "PesanPro",
        logoUrl: "",
        faviconUrl: "/favicon.ico",
        timezone: "Asia/Jakarta",
        enableRegistration: true,
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
        paymentNote: "",
        supportWhatsapp: ""
    });
    const [systemLoading, setSystemLoading] = useState(false);
    const [timezones, setTimezones] = useState<string[]>(["UTC", "Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);
    const [pluginZip, setPluginZip] = useState<{ customUploaded: boolean; sizeBytes: number | null }>({ customUploaded: false, sizeBytes: null });
    const [pluginZipFile, setPluginZipFile] = useState<File | null>(null);
    const [pluginUploading, setPluginUploading] = useState(false);

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
                        bankName: data.bankName || "",
                        bankAccountNumber: data.bankAccountNumber || "",
                        bankAccountHolder: data.bankAccountHolder || "",
                        paymentNote: data.paymentNote || "",
                        supportWhatsapp: data.supportWhatsapp || ""
                    });
                }
            })
            .catch(() => { });
    }, []);

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

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    const bankReady = Boolean(
        systemConfig.bankName.trim() &&
        systemConfig.bankAccountNumber.trim() &&
        systemConfig.bankAccountHolder.trim()
    );
    const supportHref = whatsappHref(systemConfig.supportWhatsapp, "Halo admin PesanPro, saya butuh bantuan.");
    const supportDisplay = formatWhatsappDisplay(systemConfig.supportWhatsapp);
    const supportInvalid = systemConfig.supportWhatsapp.trim().length > 0 && !supportHref;

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

            {/* Payment destination used by the registration onboarding */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Payment destination</CardTitle>
                    <CardDescription>
                        Shown on the sign-up screen. New accounts choose a plan, transfer to this account, and upload the proof before they can finish registering.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>Bank name</Label>
                            <input
                                className={inputClass}
                                placeholder="BCA"
                                value={systemConfig.bankName}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, bankName: e.target.value }))}
                                disabled={!isSuperAdmin}
                                maxLength={120}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Account number</Label>
                            <input
                                className={inputClass}
                                placeholder="1234567890"
                                value={systemConfig.bankAccountNumber}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, bankAccountNumber: e.target.value }))}
                                disabled={!isSuperAdmin}
                                maxLength={60}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Account holder</Label>
                            <input
                                className={inputClass}
                                placeholder="Nama pemilik rekening"
                                value={systemConfig.bankAccountHolder}
                                onChange={(e) => setSystemConfig(prev => ({ ...prev, bankAccountHolder: e.target.value }))}
                                disabled={!isSuperAdmin}
                                maxLength={160}
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Payment note (optional)</Label>
                        <textarea
                            className={`${inputClass} h-auto min-h-24 py-2`}
                            placeholder="Transfer only to this account. We never ask you to pay a different one."
                            value={systemConfig.paymentNote}
                            onChange={(e) => setSystemConfig(prev => ({ ...prev, paymentNote: e.target.value }))}
                            disabled={!isSuperAdmin}
                            maxLength={500}
                        />
                        <p className="text-xs text-muted-foreground">Extra instruction shown under the account number on the sign-up screen.</p>
                    </div>

                    {!bankReady ? (
                        <p className="rounded-md border border-[var(--pp-danger)] bg-[var(--pp-paper)] px-3 py-2 text-sm text-[var(--pp-danger)]">
                            Registrations are blocked until bank name, account number, and account holder are filled in.
                        </p>
                    ) : null}

                    <div className="pt-2">
                        <Button onClick={handleSaveSystem} disabled={systemLoading || !isSuperAdmin}>
                            {systemLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Payment Destination
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
        </div>
    );
}
