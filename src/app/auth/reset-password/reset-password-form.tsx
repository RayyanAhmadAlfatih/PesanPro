"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Pesan error dari POST /api/auth/reset-password masih berbahasa Inggris;
// dipetakan di sini supaya tampilan konsisten berbahasa Indonesia tanpa perlu
// mengubah endpoint maupun logika token (tautan tetap berlaku 30 menit dan
// sekali pakai).
const PESAN_ERROR_API: Record<string, string> = {
  "Too many reset attempts. Please try again later.": "Terlalu banyak percobaan reset. Coba lagi nanti.",
  "Invalid reset request": "Permintaan reset tidak valid",
  "Reset link is invalid or expired": "Tautan reset tidak valid atau sudah kedaluwarsa",
};

function terjemahkanPesanError(pesan: string): string {
  return PESAN_ERROR_API[pesan] ?? pesan;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Konfirmasi password tidak sama");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(terjemahkanPesanError(body.error ?? "Gagal mengatur ulang password"));
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal mengatur ulang password");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#315b2c]" />
        <h1 className="mt-5 text-2xl font-bold text-[#1d2c1b]">Password berhasil diperbarui</h1>
        <p className="mt-2 text-sm text-slate-600">Semua sesi lama sudah dicabut. Masuk kembali dengan password baru Anda.</p>
        <Button asChild className="mt-7 h-11 w-full rounded-xl bg-[#315b2c] hover:bg-[#284b25]">
          <Link href="/auth/login">Lanjut ke halaman masuk</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#315b2c] text-white">
        <LockKeyhole className="h-6 w-6" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-[#1d2c1b]">Pilih password baru</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Gunakan minimal 10 karakter dengan huruf besar, huruf kecil, dan angka.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password baru" className="h-12 rounded-xl" />
        <Input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Konfirmasi password baru" className="h-12 rounded-xl" />
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <Button className="h-12 w-full rounded-xl bg-[#315b2c] hover:bg-[#284b25]" disabled={loading || !token}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Atur ulang password
        </Button>
      </form>
    </>
  );
}
