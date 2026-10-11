import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import pkg from "../../package.json";

// HTML must always reference the assets from the currently running build.
// Hashed /_next/static assets remain immutable and cacheable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const appName = process.env.APP_NAME?.trim() || "PesanPro";

export const metadata = {
  title: `${appName} | WhatsApp Gateway`,
  description:
    "Hubungkan nomor WhatsApp ke aplikasi Anda lewat REST API dan webhook. Isi pesan tidak disimpan.",
  openGraph: {
    title: `${appName} | WhatsApp Gateway`,
    description:
      "Kirim dan terima WhatsApp lewat REST API. Webhook untuk pesan masuk, antrian pesan yang tahan restart, dan isi pesan tidak disimpan.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://wagateway.kingofcoding.my.id",
  },
  twitter: {
    card: "summary_large_image",
    title: `${appName} | WhatsApp Gateway`,
    description:
      "Kirim dan terima WhatsApp lewat REST API. Webhook untuk pesan masuk, antrian pesan yang tahan restart, dan isi pesan tidak disimpan.",
  },
};

// The four steps are the product's actual flow, in the order a customer meets
// them. They are not padded to three.
const steps = [
  {
    title: "Hubungkan nomor",
    body: "Scan QR dari dashboard. Anda bisa menambahkan beberapa nomor sekaligus, dan setiap nomor berjalan sebagai sesi terpisah.",
  },
  {
    title: "Buat kunci API",
    body: "Pilih scope sesuai kebutuhan integrasi. Setiap kunci bisa dibatasi per alamat IP dan diberi tanggal kedaluwarsa.",
  },
  {
    title: "Kirim pesan",
    body: "Panggil REST API untuk teks, media, dan dokumen. Pesan masuk antrian yang tahan restart dan dicoba ulang saat gagal.",
  },
  {
    title: "Terima event",
    body: "Webhook mengirim pesan masuk, perubahan status pengiriman, dan update koneksi ke server Anda.",
  },
];

const capabilities = [
  {
    title: "Balasan otomatis",
    body: "Cocokkan kata kunci pada pesan masuk dan balas otomatis, dengan batas laju per nomor.",
  },
  {
    title: "Jadwal kirim",
    body: "Kirim pada waktu tertentu dengan zona waktu per jadwal, termasuk lampiran media privat.",
  },
  {
    title: "Kirim massal",
    body: "Kirim ke daftar penerima dengan jeda acak antar pesan. Daftar opt-out dihormati sebelum pengiriman.",
  },
  {
    title: "Antrian pesan",
    body: "Pantau status tiap pesan di antrian, lengkap dengan percobaan ulang dan alasan gagal.",
  },
];

const notStored = [
  {
    title: "Isi pesan",
    body: "Teks dan caption tidak pernah ditulis ke database. Kami meneruskannya ke webhook Anda, lalu membuangnya.",
  },
  {
    title: "Media pesan",
    body: "Foto, video, dan dokumen tidak diunduh ke server kami. File tetap berada di server WhatsApp.",
  },
];

function formatPrice(value: unknown, currency: string) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Gratis";
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: currency || "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "IDR"} ${amount.toLocaleString("id-ID")}`;
  }
}

async function loadPlans() {
  try {
    return await prisma.plan.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, priceMonthly: true, currency: true, trialDays: true },
      orderBy: [{ priceMonthly: "asc" }, { name: "asc" }],
    });
  } catch {
    // A pricing table is not worth failing the whole page for.
    return [];
  }
}

export default async function Home() {
  const plans = await loadPlans();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--pp-paper)] text-[var(--pp-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--pp-line)] bg-[var(--pp-paper)]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-ink)] font-[family-name:var(--font-display)] text-base font-extrabold text-[var(--pp-paper)]">
              {appName.charAt(0).toUpperCase()}
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight">
              {appName}
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link href="#cara-kerja" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] sm:block">
              Cara kerja
            </Link>
            {plans.length > 0 && (
              <Link href="#harga" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] sm:block">
                Harga
              </Link>
            )}
            <Link href="/auth/login">
              <Button size="sm" className="rounded-md px-4">
                Masuk
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Kirim dan terima WhatsApp lewat API.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--pp-muted)]">
            Hubungkan nomor WhatsApp Anda, lalu kirim pesan dan terima balasan lewat REST API dan webhook.
            Isi pesan tidak kami simpan.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/auth/login">
              <Button variant="outline" size="lg" className="pp-accent-yellow rounded-lg px-6 text-base">
                Masuk ke dashboard
              </Button>
            </Link>
            <Link href="/auth/register" className="text-sm font-semibold underline decoration-[var(--pp-line)] underline-offset-4 transition-colors hover:decoration-[var(--pp-ink)]">
              Buat akun
            </Link>
          </div>
        </section>

        <section id="cara-kerja" className="border-t border-[var(--pp-line)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Cara kerja</p>
            <h2 className="pp-section-title mt-3">Empat langkah dari nomor kosong ke pesan pertama.</h2>

            <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-line)] sm:grid-cols-2">
              {steps.map((step, index) => (
                <li key={step.title} className="bg-[var(--pp-white)] p-6">
                  <span className="font-[family-name:var(--font-mono-ui)] text-sm font-bold text-[var(--pp-muted)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-lg font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pp-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Setelah tersambung</p>
            <h2 className="pp-section-title mt-3">Yang bisa Anda jalankan di atas pipa yang sama.</h2>

            <dl className="mt-10 divide-y divide-[var(--pp-line)] border-y border-[var(--pp-line)]">
              {capabilities.map((item) => (
                <div key={item.title} className="grid gap-2 py-5 sm:grid-cols-[220px_1fr] sm:gap-6">
                  <dt className="font-semibold">{item.title}</dt>
                  <dd className="text-sm leading-relaxed text-[var(--pp-muted)]">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {plans.length > 0 && (
          <section id="harga" className="border-t border-[var(--pp-line)]">
            <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
              <p className="pp-eyebrow">Harga</p>
              <h2 className="pp-section-title mt-3">Bayar per bulan, tanpa biaya per pesan.</h2>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {plans.map((plan) => (
                  <div key={plan.id} className="flex flex-col rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-6">
                    <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
                    <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight">
                      {formatPrice(plan.priceMonthly, plan.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--pp-muted)]">
                      {Number(plan.priceMonthly ?? 0) > 0
                        ? "per bulan"
                        : plan.trialDays > 0
                          ? `${plan.trialDays} hari, tanpa kartu`
                          : "tanpa biaya"}
                    </p>
                    {plan.description && (
                      <p className="mt-4 text-sm leading-relaxed text-[var(--pp-muted)]">{plan.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-mint)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Privasi</p>
            <h2 className="pp-section-title mt-3">Yang tidak kami simpan.</h2>

            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {notStored.map((item) => (
                <div key={item.title}>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pp-muted)]">{item.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
              Yang kami simpan hanya metadata pengiriman: ID pesan, status kirim, nomor pengirim dan penerima,
              serta waktu. Metadata ini dihapus otomatis setelah 30 hari. Rinciannya ada di{" "}
              <Link href="/privacy" className="font-semibold text-[var(--pp-ink)] underline decoration-[var(--pp-line)] underline-offset-4">
                kebijakan privasi
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-7 items-center justify-center rounded-md border border-[var(--pp-ink)] bg-[var(--pp-ink)] font-[family-name:var(--font-display)] text-xs font-extrabold text-[var(--pp-paper)]">
              {appName.charAt(0).toUpperCase()}
            </span>
            <span className="text-sm font-semibold">{appName}</span>
            <span className="font-[family-name:var(--font-mono-ui)] text-xs text-[var(--pp-muted)]">
              v{pkg.version}
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-6 text-sm">
            <Link href="/privacy" className="text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)]">
              Kebijakan privasi
            </Link>
            <Link href="/terms" className="text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)]">
              Ketentuan layanan
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
