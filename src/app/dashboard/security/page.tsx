import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/dashboard/change-password-form";

export const metadata: Metadata = {
    title: "Keamanan akun | PesanPro",
};

// Halaman ganti password untuk SEMUA pengguna login (tenant dan SuperAdmin).
// Sengaja diletakkan di luar /dashboard/settings: layout settings dibungkus
// SuperadminOnly karena isinya konfigurasi sistem, sedangkan password adalah
// milik akun sendiri — jalurnya dipisah supaya tenant tetap bisa mengubahnya
// tanpa bisa membuka konfigurasi sistem.
export default function SecurityPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Keamanan akun</h2>
                <p className="text-muted-foreground text-sm mt-1">Ganti password login dashboard Anda.</p>
            </div>
            <ChangePasswordForm />
        </div>
    );
}
