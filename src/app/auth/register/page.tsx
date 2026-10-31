'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
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
import { Loader2 } from "lucide-react";
import { getErrorMessage } from '@/lib/error-utils';

const formSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string()
        .min(10, "Password must be at least 10 characters")
        .max(128, "Password must be at most 128 characters")
        .regex(/[a-z]/, "Password must contain a lowercase letter")
        .regex(/[A-Z]/, "Password must contain an uppercase letter")
        .regex(/[0-9]/, "Password must contain a number"),
    confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

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

export default function RegisterPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            confirmPassword: ""
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: values.name,
                    email: values.email,
                    password: values.password,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to register");
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/auth/login');
            }, 2000);

        } catch (err: unknown) {
            setError(getErrorMessage(err) || "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
                        <h1 className="text-2xl font-bold">Account created</h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Your PesanPro workspace is ready. Redirecting you to the sign-in page...
                        </p>
                        <p className="mt-4 text-sm text-muted-foreground">
                            Next step: choose a package and submit your payment proof. Messaging stays locked until the payment is approved.
                        </p>
                    </div>
                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
                            Go to sign in now
                        </Link>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
            <div className="w-full max-w-md">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold">Create an account</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Create your PesanPro workspace to connect WhatsApp and send messages through the dashboard or API.
                    </p>
                </div>

                <div className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <ErrorNotice message={error} />

                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full name</FormLabel>
                                        <FormControl>
                                            <Input autoComplete="name" placeholder="Nama lengkap" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
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
                                            <Input type="password" autoComplete="new-password" placeholder="At least 10 characters" {...field} />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">
                                            Use 10+ characters with an uppercase letter, a lowercase letter, and a number.
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="confirmPassword"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Confirm password</FormLabel>
                                        <FormControl>
                                            <Input type="password" autoComplete="new-password" placeholder="Repeat your password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                                {loading ? "Creating account..." : "Create account"}
                            </Button>
                        </form>
                    </Form>

                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                        By registering, you agree to our{" "}
                        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Terms of Service</Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Privacy Policy</Link>.
                    </p>
                </div>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
