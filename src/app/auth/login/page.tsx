'use client';

import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  email: z.string().email("Masukkan alamat email yang valid."),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

// Duplicated from src/lib/otp-policy.ts on purpose: that module imports
// node:crypto for the HMAC, which cannot be pulled into a client bundle.
const OTP_CODE_LENGTH = 6;

/**
 * NextAuth returns the `code` set by the credentials provider, so each refusal
 * gets its own sentence instead of one generic failure for every cause.
 */
const OTP_ERROR_MESSAGES: Record<string, string> = {
  no_challenge: "Kode sudah tidak berlaku. Minta kode baru.",
  expired: "Kode sudah kedaluwarsa. Minta kode baru.",
  attempts_exhausted: "Terlalu banyak percobaan salah. Minta kode baru.",
  wrong_code: "Kode tidak benar.",
  invalid_code: "Masukkan enam digit kode dari email.",
  rate_limited: "Terlalu banyak percobaan dari jaringan ini. Coba lagi nanti.",
  account_inactive: "Akun ini tidak aktif. Hubungi administrator.",
  fallback: "Tidak bisa masuk dengan kode itu. Coba lagi.",
};

function ErrorNotice({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-[var(--pp-danger)] bg-[var(--pp-white)] px-3 py-2 text-sm font-medium text-[var(--pp-danger)]"
    >
      {message}
    </div>
  );
}

function PasswordPanel({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: values.email,
        password: values.password,
      });

      if (result?.error) {
        // Generic on purpose: the same sentence for an unknown email and a
        // wrong password, so the form never reveals whether an account exists.
        // Kept verbatim: the login-failure message is a passing
        // anti-enumeration item and must not be changed by the copy pass.
        setError("Invalid email or password");
      } else {
        window.location.href = callbackUrl;
        router.refresh();
      }
    } catch {
      setError("Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <ErrorNotice id="login-password-error" message={error} />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="nama@email.com" {...field} />
              </FormControl>
              <FormMessage role="alert" aria-live="assertive" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kata sandi</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" placeholder="Kata sandi Anda" {...field} />
              </FormControl>
              <FormMessage role="alert" aria-live="assertive" />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm font-semibold underline-offset-4 hover:underline">
            Lupa kata sandi?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {loading ? "Sedang masuk..." : "Masuk"}
        </Button>
      </form>
    </Form>
  );
}

function OtpPanel({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // One chained timeout instead of an interval, so the countdown stops on its
  // own and cannot keep ticking after unmount.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function requestCode() {
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const payload = await response.json().catch(() => null) as
        | { error?: string; data?: { resendAfterMs?: number } }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? "Kode tidak bisa dikirim. Coba lagi.");
        return;
      }

      setSentTo(normalized);
      setCode("");
      // Generic for registered and unknown addresses alike; the neutral
      // sentence below explains the case where no email will arrive.
      setNotice(`Code sent to ${normalized}.`);
      setResendIn(Math.max(1, Math.ceil((payload?.data?.resendAfterMs ?? 60_000) / 1000)));
    } catch {
      setError("Kode tidak bisa dikirim. Coba lagi.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (!sentTo || code.length !== OTP_CODE_LENGTH) return;
    setVerifying(true);
    setError(null);
    try {
      const result = await signIn('email-otp', {
        redirect: false,
        email: sentTo,
        code,
      });

      if (result?.error) {
        setError(OTP_ERROR_MESSAGES[result.code ?? ""] ?? OTP_ERROR_MESSAGES.fallback);
        return;
      }

      window.location.href = callbackUrl;
      router.refresh();
    } catch {
      setError("Terjadi kesalahan tak terduga.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNotice id="login-otp-error" message={error} />

      <div className="space-y-2">
        <Label htmlFor="otp-email">Email</Label>
        <Input
          id="otp-email"
          type="email"
          autoComplete="email"
          placeholder="nama@email.com"
          value={email}
          disabled={sending || verifying}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-otp-email-hint login-otp-error" : "login-otp-email-hint"}
          onChange={(event) => setEmail(event.target.value)}
        />
        <p id="login-otp-email-hint" className="text-xs text-muted-foreground">
          Gunakan alamat email yang terdaftar di akun PesanPro Anda. Kami akan mengirim kode enam digit ke alamat itu.
        </p>
        <p className="text-xs text-muted-foreground">
          Kalau email tidak terdaftar, kode tidak akan terkirim.
        </p>
      </div>

      {sentTo === null ? (
        <Button type="button" className="w-full" onClick={() => void requestCode()} disabled={sending}>
          {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {sending ? "Mengirim kode..." : "Kirim kode ke email"}
        </Button>
      ) : (
        <>
          <p aria-live="polite" className="text-sm text-muted-foreground">{notice}</p>

          <div className="space-y-2">
            <Label htmlFor="otp-code">Kode login</Label>
            <Input
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="font-mono text-lg tracking-[0.3em]"
              value={code}
              disabled={verifying}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-otp-code-hint login-otp-error" : "login-otp-code-hint"}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
            />
            <p id="login-otp-code-hint" className="text-xs text-muted-foreground">
              Kode berlaku 10 menit dan hanya bisa dipakai sekali.
            </p>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={() => void verifyCode()}
            disabled={verifying || code.length !== OTP_CODE_LENGTH}
          >
            {verifying ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {verifying ? "Memeriksa kode..." : "Masuk"}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending || verifying}
              onClick={() => { setSentTo(null); setNotice(null); setError(null); setCode(""); }}
            >
              Ganti email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending || verifying || resendIn > 0}
              onClick={() => void requestCode()}
            >
              {resendIn > 0 ? `Kirim kode baru dalam ${resendIn} detik` : "Kirim kode baru"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function LoginScreen() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Masuk</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Masuk ke ruang kerja PesanPro untuk mengelola perangkat, pesan, dan kunci API.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
          <Tabs defaultValue="password">
            <TabsList className="w-full">
              <TabsTrigger value="password" className="flex-1">Email dan kata sandi</TabsTrigger>
              <TabsTrigger value="otp" className="flex-1">Email OTP</TabsTrigger>
            </TabsList>
            <TabsContent value="password" className="pt-4">
              <PasswordPanel callbackUrl={callbackUrl} />
            </TabsContent>
            <TabsContent value="otp" className="pt-4">
              <OtpPanel callbackUrl={callbackUrl} />
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href="/auth/register" className="font-semibold underline-offset-4 hover:underline">
            Buat akun
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)]">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      </div>
    }>
      <LoginScreen />
    </Suspense>
  );
}
