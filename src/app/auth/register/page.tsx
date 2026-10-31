'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PlanEntitlement {
  feature: string;
  enabled: boolean;
  limitValue: string | null;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: string | null;
  priceYearly: string | null;
  currency: string;
  entitlements: PlanEntitlement[];
}

interface PaymentInfo {
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  note: string;
  ready: boolean;
}

interface OnboardingPayload {
  registrationEnabled: boolean;
  payment: PaymentInfo;
  plans: Plan[];
}

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function formatRupiah(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Belum tersedia';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: string | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return new Intl.NumberFormat('id-ID').format(amount);
}

function formatBytes(value: string | null) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return `${Number(mb.toFixed(1))} MB`;
}

function planFacts(plan: Plan) {
  const get = (feature: string) => plan.entitlements.find((item) => item.feature === feature && item.enabled);
  const facts: string[] = [];
  const devices = get('DEVICES');
  if (devices?.limitValue) facts.push(`${formatNumber(devices.limitValue)} nomor WhatsApp`);
  const messages = get('MESSAGES_MONTHLY');
  if (messages?.limitValue) facts.push(`${formatNumber(messages.limitValue)} pesan per bulan`);
  const upload = get('MEDIA_MAX_UPLOAD_BYTES');
  const uploadLabel = formatBytes(upload?.limitValue ?? null);
  if (uploadLabel) facts.push(`File maksimal ${uploadLabel}`);
  return facts;
}

function passwordIssue(password: string) {
  if (password.length < 10) return 'Kata sandi minimal 10 karakter.';
  if (!/[a-z]/.test(password)) return 'Kata sandi harus punya huruf kecil.';
  if (!/[A-Z]/.test(password)) return 'Kata sandi harus punya huruf besar.';
  if (!/[0-9]/.test(password)) return 'Kata sandi harus punya angka.';
  return null;
}

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
  const [data, setData] = useState<OnboardingPayload | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    planId: '',
    billingCycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    reference: '',
  });
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ email: string; planName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/onboarding', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.data) throw new Error('Data pendaftaran tidak bisa dimuat.');
        if (cancelled) return;
        setData(body.data as OnboardingPayload);
        const firstPlan = (body.data as OnboardingPayload).plans[0];
        if (firstPlan) setForm((current) => ({ ...current, planId: firstPlan.id }));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Data pendaftaran tidak bisa dimuat.');
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedPlan = useMemo(
    () => data?.plans.find((plan) => plan.id === form.planId) ?? null,
    [data, form.planId],
  );
  const amount = selectedPlan
    ? (form.billingCycle === 'YEARLY' ? selectedPlan.priceYearly : selectedPlan.priceMonthly)
    : null;

  const proofTooLarge = proof !== null && proof.size > MAX_PROOF_BYTES;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const passwordProblem = passwordIssue(form.password);
  const passwordsMatch = form.password.length > 0 && form.password === form.confirmPassword;
  const accountReady = form.name.trim().length >= 2 && emailValid && !passwordProblem && passwordsMatch;
  const paymentReady = Boolean(
    data?.payment.ready &&
    selectedPlan &&
    amount &&
    form.reference.trim().length >= 3 &&
    proof &&
    !proofTooLarge,
  );
  const canSubmit = Boolean(data?.registrationEnabled) && accountReady && paymentReady && !submitting;

  const update = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const copyAccountNumber = async () => {
    if (!data?.payment.bankAccountNumber) return;
    try {
      await navigator.clipboard.writeText(data.payment.bankAccountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !proof) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('name', form.name.trim());
      body.set('email', form.email.trim());
      body.set('password', form.password);
      body.set('planId', form.planId);
      body.set('billingCycle', form.billingCycle);
      body.set('reference', form.reference.trim());
      body.set('proof', proof);
      const response = await fetch('/api/auth/register', { method: 'POST', body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Pendaftaran gagal. Coba lagi.');
      }
      setSuccess({ email: form.email.trim(), planName: selectedPlan?.name ?? 'paket' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pendaftaran gagal. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
            <CheckCircle2 className="h-10 w-10 text-[var(--pp-ink)]" aria-hidden="true" />
            <h1 className="mt-3 text-2xl font-bold">Pendaftaran terkirim</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Akun <strong>{success.email}</strong> sudah dibuat dengan paket <strong>{success.planName}</strong>.
              Bukti transfer Anda sedang diperiksa admin.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Setelah disetujui, masuk dengan email dan kata sandi Anda. Pengiriman pesan aktif setelah pembayaran disetujui.
            </p>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
              Ke halaman masuk
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)]">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Memuat data pendaftaran" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-[var(--pp-danger)] bg-[var(--pp-white)] p-6">
          <h1 className="text-xl font-bold">Pendaftaran belum bisa dibuka</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError ?? 'Data pendaftaran tidak tersedia.'}</p>
          <Button className="mt-4 w-full" variant="outline" onClick={() => window.location.reload()}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  if (!data.registrationEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
          <h1 className="text-xl font-bold">Pendaftaran ditutup</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Admin sedang menutup pendaftaran akun baru. Hubungi admin kalau Anda butuh akses.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
              Sudah punya akun? Masuk
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!data.payment.ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
        <div className="w-full max-w-md rounded-xl border border-[var(--pp-danger)] bg-[var(--pp-white)] p-6">
          <h1 className="text-xl font-bold">Pembayaran belum siap</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Admin belum mengisi rekening tujuan, jadi pendaftaran belum bisa dilanjutkan. Hubungi admin untuk info rekening.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
              Ke halaman masuk
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pp-paper)] px-4 py-10">
      <div className="w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Buat akun PesanPro</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Isi data akun, pilih paket, lalu transfer dan unggah bukti. Akun aktif setelah admin menyetujui pembayaran.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <section className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
            <h2 className="text-lg font-semibold">1. Data akun</h2>
            <p className="mt-1 text-sm text-muted-foreground">Email ini dipakai untuk masuk dan menerima kode verifikasi.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Nama lengkap</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Nama lengkap"
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  maxLength={120}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nama@email.com"
                  value={form.email}
                  onChange={(event) => update({ email: event.target.value })}
                />
                {form.email.length > 0 && !emailValid ? (
                  <p className="text-xs text-[var(--pp-danger)]">Format email belum benar.</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Kata sandi</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimal 10 karakter"
                  value={form.password}
                  onChange={(event) => update({ password: event.target.value })}
                />
                {form.password.length > 0 && passwordProblem ? (
                  <p className="text-xs text-[var(--pp-danger)]">{passwordProblem}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Gunakan huruf besar, huruf kecil, dan angka.</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Ulangi kata sandi</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ulangi kata sandi"
                  value={form.confirmPassword}
                  onChange={(event) => update({ confirmPassword: event.target.value })}
                />
                {form.confirmPassword.length > 0 && !passwordsMatch ? (
                  <p className="text-xs text-[var(--pp-danger)]">Kata sandi belum sama.</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
            <h2 className="text-lg font-semibold">2. Pilih paket</h2>
            <p className="mt-1 text-sm text-muted-foreground">Semua paket mendapat fitur yang sama. Bedanya di batas pemakaian.</p>
            {data.plans.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-[var(--pp-line)] p-4 text-sm text-muted-foreground">
                Belum ada paket aktif. Hubungi admin sebelum mendaftar.
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {data.plans.map((plan) => {
                const selected = plan.id === form.planId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => update({ planId: plan.id })}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      selected
                        ? 'border-[var(--pp-ink)] bg-[var(--pp-highlight)]/25 ring-2 ring-[var(--pp-ink)]/15'
                        : 'border-[var(--pp-line)] bg-[var(--pp-white)] hover:bg-[var(--pp-paper)]',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{plan.name}</span>
                      {selected ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-2 block font-[family-name:var(--font-display)] text-xl font-extrabold">
                      {formatRupiah(plan.priceMonthly)}
                    </span>
                    <span className="text-xs text-muted-foreground">per bulan</span>
                    <span className="mt-3 block space-y-1 text-xs text-muted-foreground">
                      {planFacts(plan).map((fact) => (
                        <span key={fact} className="block">{fact}</span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-2">
              <Label>Lama langganan</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.billingCycle === 'MONTHLY' ? 'default' : 'outline'}
                  aria-pressed={form.billingCycle === 'MONTHLY'}
                  onClick={() => update({ billingCycle: 'MONTHLY' })}
                >
                  1 bulan
                </Button>
                <Button
                  type="button"
                  variant={form.billingCycle === 'YEARLY' ? 'default' : 'outline'}
                  aria-pressed={form.billingCycle === 'YEARLY'}
                  onClick={() => update({ billingCycle: 'YEARLY' })}
                >
                  12 bulan
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Bayar 12 bulan di muka lebih murah daripada bayar bulanan.</p>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
            <h2 className="text-lg font-semibold">3. Transfer dan unggah bukti</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Transfer tepat sebesar nominal di bawah ke rekening ini, lalu unggah bukti transfernya.
            </p>

            <div className="mt-4 rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-highlight)]/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">Rekening tujuan</p>
              <p className="mt-1 text-lg font-bold">{data.payment.bankName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums">
                  {data.payment.bankAccountNumber}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyAccountNumber()}>
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {copied ? 'Tersalin' : 'Salin'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">a.n. {data.payment.bankAccountHolder}</p>
              {data.payment.note ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data.payment.note}</p>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg border border-[var(--pp-line)] bg-[var(--pp-paper)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pp-muted)]">Jumlah transfer</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums" aria-live="polite">
                {amount ? formatRupiah(amount) : 'Pilih paket dulu'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPlan?.name ?? 'Paket'} · {form.billingCycle === 'YEARLY' ? '12 bulan' : '1 bulan'}
              </p>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="reference">Nama pengirim atau kode referensi</Label>
                <Input
                  id="reference"
                  value={form.reference}
                  onChange={(event) => update({ reference: event.target.value })}
                  placeholder="Contoh: Ayu Setiawan"
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">Tulis nama yang muncul di mutasi bank agar admin mudah mencocokkan.</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="proof">Bukti transfer</Label>
                <div className="relative">
                  <input
                    id="proof"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="peer sr-only"
                    onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="proof"
                    className={cn(
                      'flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors',
                      'border-[var(--pp-line)] bg-[var(--pp-white)] hover:bg-[var(--pp-paper)]',
                      'peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring',
                      proofTooLarge ? 'border-[var(--pp-danger)]' : '',
                    )}
                  >
                    <FileUp className="h-6 w-6" aria-hidden="true" />
                    <span className="max-w-full truncate text-sm font-semibold">
                      {proof ? proof.name : 'Pilih foto atau PDF'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {proof ? 'Klik untuk mengganti.' : 'JPG, PNG, WebP, atau PDF. Maksimal 5 MB.'}
                    </span>
                  </label>
                </div>
                {proofTooLarge ? (
                  <p className="text-xs text-[var(--pp-danger)]">File terlalu besar. Kecilkan sampai di bawah 5 MB.</p>
                ) : null}
              </div>
            </div>
          </section>

          <ErrorNotice message={error} />

          <div className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-4">
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {submitting ? 'Mengirim pendaftaran...' : 'Buat akun dan kirim bukti bayar'}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Pendaftaran tidak bisa dikirim sebelum paket dipilih dan bukti transfer dilampirkan.
            </p>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Sudah punya akun?{' '}
          <Link href="/auth/login" className="font-semibold underline-offset-4 hover:underline">
            Masuk
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">Dibuat oleh wa-akg</p>
      </div>
    </div>
  );
}
