"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to request password reset");
      setMessage(body.message ?? "Check your email for reset instructions.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to request password reset");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7ef] px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(90,138,70,0.24),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(212,225,177,0.5),transparent_45%)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-2xl shadow-[#315b2c]/10 backdrop-blur-xl">
        <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#315b2c] text-white">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#1d2c1b]">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter your account email. The reset link is valid for 30 minutes.</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className="h-12 rounded-xl"
          />
          <Button className="h-12 w-full rounded-xl bg-[#315b2c] hover:bg-[#284b25]" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send reset link
          </Button>
        </form>

        {message ? <p className="mt-5 rounded-xl bg-[#edf4e7] p-3 text-sm text-[#315b2c]">{message}</p> : null}
        <Link href="/auth/login" className="mt-7 inline-flex items-center text-sm font-medium text-slate-600 hover:text-[#315b2c]">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
        </Link>
      </section>
    </main>
  );
}
