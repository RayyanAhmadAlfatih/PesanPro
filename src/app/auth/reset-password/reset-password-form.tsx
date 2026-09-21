"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      setError("Password confirmation does not match.");
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
      if (!response.ok) throw new Error(body.error ?? "Unable to reset password");
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset password");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#315b2c]" />
        <h1 className="mt-5 text-2xl font-bold text-[#1d2c1b]">Password updated</h1>
        <p className="mt-2 text-sm text-slate-600">All older sessions have been revoked. Sign in again with your new password.</p>
        <Button asChild className="mt-7 h-11 w-full rounded-xl bg-[#315b2c] hover:bg-[#284b25]">
          <Link href="/auth/login">Continue to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#315b2c] text-white">
        <LockKeyhole className="h-6 w-6" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-[#1d2c1b]">Choose a new password</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Use at least 10 characters with uppercase, lowercase, and a number.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="h-12 rounded-xl" />
        <Input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Confirm new password" className="h-12 rounded-xl" />
        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <Button className="h-12 w-full rounded-xl bg-[#315b2c] hover:bg-[#284b25]" disabled={loading || !token}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Reset password
        </Button>
      </form>
    </>
  );
}
