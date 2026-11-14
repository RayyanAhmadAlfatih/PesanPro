"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Formulir ganti password milik sesi sendiri. Dipakai di halaman Keamanan akun
// (/dashboard/security, terbuka untuk semua pengguna login) dan di kartu yang
// sama pada halaman Settings, supaya logika validasi dan panggilan ke
// POST /api/user/password tinggal ada di satu tempat.
// Batas server tidak berubah di sini: password baru minimal 8 karakter dan
// rate limit 5 percobaan salah per 15 menit tetap dikelola endpoint.
export function ChangePasswordForm() {
    const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
    const [changingPassword, setChangingPassword] = useState(false);

    const changePassword = async () => {
        if (passwordForm.next !== passwordForm.confirm) {
            toast.error("Konfirmasi password tidak sama");
            return;
        }
        setChangingPassword(true);
        try {
            const response = await fetch("/api/user/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.next }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Gagal mengubah password");
            toast.success("Password berhasil diubah. Gunakan password baru pada login berikutnya.");
            setPasswordForm({ current: "", next: "", confirm: "" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal mengubah password");
        } finally {
            setChangingPassword(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Keamanan akun</CardTitle>
                <CardDescription>Ganti password login dashboard Anda. Password baru minimal 8 karakter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                        <Label htmlFor="current-password">Password saat ini</Label>
                        <Input
                            id="current-password"
                            type="password"
                            autoComplete="current-password"
                            value={passwordForm.current}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="new-password">Password baru</Label>
                        <Input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            value={passwordForm.next}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, next: e.target.value }))}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="confirm-password">Konfirmasi password baru</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            autoComplete="new-password"
                            value={passwordForm.confirm}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
                        />
                    </div>
                </div>
                <Button
                    disabled={changingPassword || !passwordForm.current || passwordForm.next.length < 8 || !passwordForm.confirm}
                    onClick={() => void changePassword()}
                >
                    {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan password baru
                </Button>
            </CardContent>
        </Card>
    );
}
