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
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// Duplicated from src/lib/otp-policy.ts on purpose: that module imports
// node:crypto for the HMAC, which cannot be pulled into a client bundle.
const OTP_CODE_LENGTH = 6;

/**
 * NextAuth returns the `code` set by the credentials provider, so each refusal
 * gets its own sentence instead of one generic failure for every cause.
 */
const OTP_ERROR_MESSAGES: Record<string, string> = {
  no_challenge: "That code is no longer valid. Request a new one.",
  expired: "That code has expired. Request a new one.",
  attempts_exhausted: "Too many wrong attempts. Request a new code.",
  wrong_code: "That code is not correct.",
  invalid_code: "Enter the six digit code from the email.",
  rate_limited: "Too many attempts from this network. Try again later.",
  account_inactive: "This account is not active. Contact the administrator.",
  fallback: "Could not sign you in with that code. Try again.",
};

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
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
        setError("Invalid email or password");
      } else {
        window.location.href = callbackUrl;
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <ErrorNotice message={error} />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="name@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" placeholder="Your password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm font-semibold underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {loading ? "Signing in..." : "Sign in"}
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
      setError("Please enter a valid email address.");
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
        setError(payload?.error ?? "Could not send the code. Try again.");
        return;
      }

      setSentTo(normalized);
      setCode("");
      setNotice(`Code sent to ${normalized}.`);
      setResendIn(Math.max(1, Math.ceil((payload?.data?.resendAfterMs ?? 60_000) / 1000)));
    } catch {
      setError("Could not send the code. Try again.");
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
      setError("An unexpected error occurred");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNotice message={error} />

      <div className="space-y-2">
        <Label htmlFor="otp-email">Email</Label>
        <Input
          id="otp-email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          disabled={sending || verifying}
          onChange={(event) => setEmail(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Use the address registered to your PesanPro account. We email a six digit code to it.
        </p>
      </div>

      {sentTo === null ? (
        <Button type="button" className="w-full" onClick={() => void requestCode()} disabled={sending}>
          {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {sending ? "Sending code..." : "Email me a code"}
        </Button>
      ) : (
        <>
          <p aria-live="polite" className="text-sm text-muted-foreground">{notice}</p>

          <div className="space-y-2">
            <Label htmlFor="otp-code">Login code</Label>
            <Input
              id="otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="font-mono text-lg tracking-[0.3em]"
              value={code}
              disabled={verifying}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))}
            />
            <p className="text-xs text-muted-foreground">The code is valid for 10 minutes and works once.</p>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={() => void verifyCode()}
            disabled={verifying || code.length !== OTP_CODE_LENGTH}
          >
            {verifying ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {verifying ? "Checking code..." : "Sign in"}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending || verifying}
              onClick={() => { setSentTo(null); setNotice(null); setError(null); setCode(""); }}
            >
              Change email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sending || verifying || resendIn > 0}
              onClick={() => void requestCode()}
            >
              {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
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
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your PesanPro workspace to manage devices, messages, and API keys.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
          <Tabs defaultValue="password">
            <TabsList className="w-full">
              <TabsTrigger value="password" className="flex-1">Email and password</TabsTrigger>
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
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="font-semibold underline-offset-4 hover:underline">
            Create an account
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
