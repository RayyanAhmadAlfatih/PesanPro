import Link from "next/link";
import Image from "next/image";
import {
  Bot,
  CalendarClock,
  Check,
  Code2,
  Megaphone,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// HTML must always reference the assets from the currently running build.
// Hashed /_next/static assets remain immutable and cacheable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const appName = process.env.APP_NAME?.trim() || "PesanPro";

export const metadata = {
  title: `${appName} | Gateway WhatsApp untuk bisnis`,
  description:
    "Gateway WhatsApp yang tidak menyimpan pesanmu. Hubungkan nomor lewat QR, kirim notifikasi, broadcast, dan balasan otomatis dari dashboard atau REST API.",
  openGraph: {
    title: `${appName} | Gateway WhatsApp untuk bisnis`,
    description:
      "Hubungkan nomor WhatsApp lewat QR, lalu kirim notifikasi, broadcast, dan balasan otomatis dari dashboard atau REST API. Isi pesan tidak disimpan.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://pesanpro.kingofcoding.my.id",
  },
  twitter: {
    card: "summary_large_image",
    title: `${appName} | Gateway WhatsApp untuk bisnis`,
    description:
      "Gateway WhatsApp yang tidak menyimpan pesanmu. Dashboard, REST API, dan webhook dalam satu tempat.",
  },
};

const manualWork = [
  "Nomor pelanggan dicatat satu per satu di HP.",
  "Pesan yang sama diketik ulang untuk setiap penerima.",
  "Pengiriman berhenti saat HP dipakai untuk hal lain.",
  "Tidak ada catatan pesan mana yang gagal.",
];

const apiResult = [
  "Pesan masuk antrian dan dikirim dengan jeda acak.",
  "Kalau gagal, sistem mencoba ulang sendiri.",
  "Status setiap pesan tersimpan sebagai metadata.",
  "Pesan masuk diteruskan ke webhook Anda.",
];

const startSteps = [
  {
    title: "Daftar, pilih paket, bayar",
    body: "Isi data akun, pilih paket dan periode, lalu transfer ke rekening yang tampil di halaman daftar. Unggah bukti transfer, dan admin memverifikasinya.",
  },
  {
    title: "Pindai QR",
    body: "Setelah pembayaran disetujui, masuk ke dashboard dan pindai QR dari ponsel. Satu nomor cukup untuk mulai; paket lebih besar menampung lebih banyak nomor.",
  },
  {
    title: "Kirim pesan pertama",
    body: "Kirim dari dashboard, atau panggil API dari sistem Anda. Panduan mulai cepat tersedia di halaman dokumentasi.",
  },
];

const features = [
  {
    icon: Zap,
    title: "Notifikasi otomatis",
    body: "Update pesanan, status pembayaran, atau nomor resi terkirim sendiri. Sistem Anda memanggil API saat ada kejadian.",
    tone: "bg-[var(--pp-highlight)]",
  },
  {
    icon: Megaphone,
    title: "Broadcast",
    body: "Satu pesan ke banyak penerima dengan jeda otomatis. Cocok untuk stok baru, promo, atau info jam operasional.",
    tone: "bg-[var(--pp-mint)]",
  },
  {
    icon: Bot,
    title: "Balasan otomatis",
    body: "Tentukan kata kunci dan jawabannya. Pelanggan yang mengetik \"harga\" atau \"jam buka\" langsung terjawab, termasuk di luar jam kerja.",
    tone: "bg-[var(--pp-teal)]",
  },
  {
    icon: Webhook,
    title: "Webhook",
    body: "Terima pemberitahuan saat ada pesan masuk atau status pengiriman berubah. Sambungkan ke kasir, toko online, atau sistem lain.",
    tone: "bg-[var(--pp-blush)]",
  },
  {
    icon: Code2,
    title: "REST API",
    body: "Kirim pesan dari aplikasi apa pun yang bisa memanggil HTTP. Contoh cURL, Node.js, dan PHP tersedia di dokumentasi.",
    tone: "bg-[var(--pp-mint)]",
  },
  {
    icon: CalendarClock,
    title: "Pesan terjadwal",
    body: "Siapkan pesan sekarang, kirim pada waktu yang Anda tentukan.",
    tone: "bg-[var(--pp-highlight)]",
  },
];

const privacyCommitments = [
  {
    title: "Isi pesan tidak disimpan",
    body: "Teks dan caption tidak pernah ditulis ke database. Kami meneruskannya ke webhook Anda pada detik yang sama, lalu membuangnya.",
  },
  {
    title: "Media tidak diunduh",
    body: "Foto, video, dan dokumen tidak ditarik ke server kami. File tetap berada di server WhatsApp.",
  },
  {
    title: "Metadata dibatasi 30 hari",
    body: "Yang tersisa hanya nomor pengirim, nomor penerima, status kirim, dan waktu. Semuanya dihapus otomatis setelah 30 hari.",
  },
  {
    title: "Bisa diputus kapan saja",
    body: "Lepas tautan dari dashboard, atau langsung dari menu Perangkat Tertaut di HP Anda.",
  },
];

const queueGuarantees = [
  {
    title: "Masa sewa",
    body: "Setiap pekerjaan yang sedang dikerjakan punya batas waktu. Kalau pemiliknya mati, pekerjaan itu kembali ke antrian.",
  },
  {
    title: "Percobaan ulang terbatas",
    body: "Kegagalan dicoba ulang dengan jeda bertambah, lalu berhenti dengan alasan yang bisa dibaca.",
  },
  {
    title: "Idempotency key",
    body: "Permintaan yang sama dikirim dua kali tidak menghasilkan dua pesan, karena setiap permintaan membawa kunci unik.",
  },
];

const faq = [
  {
    question: "Apakah ada paket gratis atau trial?",
    answer:
      "Tidak. PesanPro berbayar sejak awal, dan akun baru aktif setelah pembayaran disetujui admin.",
  },
  {
    question: "Apakah PesanPro membaca isi pesan saya?",
    answer:
      "Tidak. Isi pesan tidak pernah ditulis ke database kami. Teks diteruskan ke webhook milik Anda, lalu dibuang. Kami juga tidak menyimpan media, dan tidak pernah menarik riwayat percakapan lama.",
  },
  {
    question: "Apakah nomor WhatsApp saya bisa diblokir?",
    answer:
      "Ada kemungkinan. WhatsApp bisa membatasi nomor yang tertaut ke layanan pihak ketiga, dan risiko itu tidak bisa kami jamin nol. Yang bisa kami lakukan adalah menjaga aktivitas tetap wajar: jeda acak antar pesan, batas laju per nomor, dan daftar opt-out yang dihormati. Kalau nomor Anda penting, pakai nomor terpisah dari nomor utama.",
  },
  {
    question: "Saya tidak bisa coding. Apakah tetap bisa memakai PesanPro?",
    answer:
      "Bisa. Dashboard dipakai lewat klik, tanpa menulis kode. API hanya diperlukan kalau Anda ingin menghubungkan sistem lain.",
  },
  {
    question: "Berapa lama akun aktif setelah transfer?",
    answer:
      "Akun berstatus menunggu sampai admin memeriksa bukti transfer. Setelah disetujui, paket langsung aktif dan Anda bisa menghubungkan WhatsApp.",
  },
  {
    question: "Bisakah satu akun memakai beberapa nomor?",
    answer:
      "Bisa. Setiap nomor berjalan sebagai sesi terpisah dengan kunci API dan webhook sendiri, jadi Anda bisa memisahkan nomor penjualan dan nomor dukungan tanpa saling mengganggu.",
  },
  {
    question: "Apakah harus selalu menyalakan HP?",
    answer:
      "Hanya sekali, saat memindai kode QR untuk menautkan nomor. Setelah itu pengiriman berjalan dari server. Kalau WhatsApp di HP memutus tautan, dashboard akan menandai sesi itu perlu dihubungkan ulang.",
  },
  {
    question: "Berapa lama data pengiriman disimpan?",
    answer:
      "Metadata pengiriman disimpan 30 hari lalu dihapus otomatis. Isi pesan dan media tidak masuk hitungan karena memang tidak pernah kami simpan.",
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

type LimitKind = "flag" | "count" | "seconds" | "bytes";

// Rows in the order a buyer reads them: what they get to run, then the
// ceilings. Campaigns are deliberately absent: that surface is retired, so
// advertising it here would promise something a tenant cannot open.
const FEATURE_ROWS: Array<{ feature: string; label: string; kind: LimitKind }> = [
  { feature: "API_ACCESS", label: "Akses REST API", kind: "flag" },
  { feature: "DEVICES", label: "Perangkat WhatsApp", kind: "count" },
  { feature: "MESSAGES_MONTHLY", label: "Pesan terkirim per bulan", kind: "count" },
  { feature: "SCHEDULED_MESSAGES", label: "Pesan terjadwal", kind: "count" },
  { feature: "BROADCASTS_MONTHLY", label: "Broadcast per bulan", kind: "count" },
  { feature: "BROADCAST_RECIPIENTS_PER_BATCH", label: "Penerima per broadcast", kind: "count" },
  { feature: "BROADCAST_MIN_DELAY_MS", label: "Jeda minimum antar pesan", kind: "seconds" },
  { feature: "AUTOREPLY_RULES", label: "Aturan balasan otomatis", kind: "count" },
  { feature: "WEBHOOKS", label: "Endpoint webhook", kind: "count" },
  { feature: "API_KEYS", label: "Kunci API", kind: "count" },
  { feature: "API_REQUESTS_PER_MINUTE", label: "Permintaan API per menit", kind: "count" },
  { feature: "API_REQUESTS_MONTHLY", label: "Permintaan API per bulan", kind: "count" },
  { feature: "MEDIA_MAX_UPLOAD_BYTES", label: "Ukuran maksimal per file", kind: "bytes" },
  { feature: "MEDIA_STORAGE_BYTES", label: "Penyimpanan media", kind: "bytes" },
];

type PlanEntitlements = Array<{ feature: string; enabled: boolean; limitValue: bigint | null }>;

function entitlementLimit(entitlements: PlanEntitlements, feature: string) {
  return entitlements.find((item) => item.feature === feature)?.limitValue ?? null;
}

function formatLimit(kind: LimitKind, limitValue: bigint | null): string {
  if (limitValue === null) return "Tanpa batas";
  const value = Number(limitValue);
  if (!Number.isFinite(value) || value <= 0) return "Tidak termasuk";
  if (kind === "seconds") return `${Math.round(value / 1000)} detik`;
  if (kind === "bytes") {
    const mb = value / (1024 * 1024);
    if (mb < 1024) return `${Math.round(mb)} MB`;
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return value.toLocaleString("id-ID");
}

// The yearly rate is a stored price, never monthly x 12, so the page reads the
// same column the billing flow charges instead of advertising a derived number.
function yearlySaving(monthly: unknown, yearly: unknown) {
  const monthlyAmount = Number(monthly ?? 0);
  const yearlyAmount = Number(yearly ?? 0);
  if (!Number.isFinite(monthlyAmount) || !Number.isFinite(yearlyAmount)) return null;
  if (monthlyAmount <= 0 || yearlyAmount <= 0) return null;
  const fullYear = monthlyAmount * 12;
  if (yearlyAmount >= fullYear) return null;
  const saved = fullYear - yearlyAmount;
  return { amount: saved, percent: Math.round((saved / fullYear) * 100) };
}

async function loadPlans() {
  try {
    return await prisma.plan.findMany({
      // Paid plans only. The default plan is an internal placeholder handed to
      // new accounts before payment, not a package a visitor can buy, so
      // listing it here would advertise a free tier the product does not sell.
      where: { isActive: true, priceMonthly: { gt: 0 } },
      select: {
        id: true,
        name: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        entitlements: { select: { feature: true, enabled: true, limitValue: true } },
      },
      orderBy: [{ priceMonthly: "asc" }, { name: "asc" }],
    });
  } catch {
    // A pricing table is not worth failing the whole page for.
    return [];
  }
}

export default async function Home() {
  const plans = await loadPlans();
  const session = await auth().catch(() => null);
  const signedIn = Boolean(session?.user?.id && session.user.accountActive !== false);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--pp-paper)] text-[var(--pp-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--pp-line)] bg-[var(--pp-paper)]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Image
              src="/brand/logo-lockup.png"
              alt={appName}
              width={1730}
              height={514}
              className="h-9 w-auto sm:h-10"
              priority
            />
          </Link>

          <nav className="flex items-center gap-6">
            <Link href="#fitur" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Fitur
            </Link>
            <Link href="#cara-mulai" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Cara mulai
            </Link>
            {plans.length > 0 && (
              <Link href="#harga" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
                Harga
              </Link>
            )}
            <Link href="#faq" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              FAQ
            </Link>
            <Link href="/docs" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Dokumentasi
            </Link>
            <Link href={signedIn ? "/dashboard" : "/auth/login"}>
              <Button size="sm" className="rounded-md px-4">
                {signedIn ? "Dashboard" : "Masuk"}
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl">
              Gateway WhatsApp yang tidak menyimpan pesanmu.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--pp-muted)]">
              Hubungkan nomor WhatsApp lewat QR, lalu kirim notifikasi, broadcast, dan balasan
              otomatis dari dashboard atau sistem Anda sendiri.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/auth/register">
                <Button size="lg" className="rounded-lg px-6 text-base">
                  Daftar sekarang
                </Button>
              </Link>
              {plans.length > 0 && (
                <Link href="#harga">
                  <Button variant="outline" size="lg" className="rounded-lg px-6 text-base">
                    Lihat harga
                  </Button>
                </Link>
              )}
            </div>
            <ul className="mx-auto mt-8 grid max-w-xl gap-2 text-sm text-[var(--pp-muted)] sm:grid-cols-2">
              {[
                "Isi pesan tidak disimpan",
                "Verifikasi pembayaran oleh admin",
                "REST API dan webhook",
                "Aktif setelah pembayaran disetujui",
              ].map((item) => (
                <li key={item} className="flex items-center justify-center gap-2 sm:justify-start">
                  <Check aria-hidden="true" className="h-4 w-4 flex-none text-[var(--pp-ink)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Ilustrasi antarmuka. Angka dan nama di bawah adalah contoh, bukan
              data pemakaian nyata, dan diberi label di tempat yang terlihat. */}
          <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-2xl border border-[var(--pp-line)] bg-[var(--pp-white)]">
            <div className="flex items-center justify-between border-b border-[var(--pp-line)] px-5 py-3">
              <span className="font-[family-name:var(--font-display)] text-sm font-bold">{appName} dashboard</span>
              <span className="text-xs text-[var(--pp-muted)]">Ilustrasi antarmuka, angka bersifat contoh</span>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--pp-line)] p-4">
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold">2</p>
                <p className="text-xs font-semibold text-[var(--pp-muted)]">Perangkat terhubung</p>
              </div>
              <div className="rounded-xl border border-[var(--pp-line)] p-4">
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold">1.204</p>
                <p className="text-xs font-semibold text-[var(--pp-muted)]">Pesan bulan ini</p>
              </div>
              <div className="rounded-xl border border-[var(--pp-line)] p-4">
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold">3</p>
                <p className="text-xs font-semibold text-[var(--pp-muted)]">Aturan auto-reply</p>
              </div>
            </div>
            <div className="space-y-2 px-5 pb-5">
              <div className="flex items-center justify-between rounded-xl border border-[var(--pp-line)] px-4 py-2.5 text-sm">
                <span><b>koc-commerce</b> · +62 838-••••-5731</span>
                <span className="pp-status-ok rounded-full px-2.5 py-0.5 text-xs font-bold">CONNECTED</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--pp-line)] px-4 py-2.5 text-sm">
                <span><b>cs-penjualan</b> · +62 852-••••-8423</span>
                <span className="pp-status-warn rounded-full px-2.5 py-0.5 text-xs font-bold">QR_REQUIRED</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--pp-line)] px-4 py-2.5 text-sm">
                <span>Broadcast info jam operasional · 128 penerima</span>
                <span className="pp-status-ok rounded-full px-2.5 py-0.5 text-xs font-bold">SELESAI</span>
              </div>
            </div>
          </div>
        </section>

        <section id="sebelum-sesudah" className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Sebelum &amp; sesudah</p>
            <h2 className="pp-section-title mt-3">Dari kirim manual jadi satu panggilan API.</h2>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)] p-6">
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">Sebelum</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--pp-muted)]">
                  {manualWork.map((item) => (
                    <li key={item} className="flex gap-3">
                      <X aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-[var(--pp-terracotta)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-mint)] p-6">
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">Sesudah pakai {appName}</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed">
                  {apiResult.map((item) => (
                    <li key={item} className="flex gap-3">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="cara-mulai" className="border-t border-[var(--pp-line)] bg-[var(--pp-mint)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Cara mulai</p>
            <h2 className="pp-section-title mt-3">Tiga langkah, hari ini juga.</h2>
            <p className="pp-page-description">
              Tanpa instal aplikasi dan tanpa setup server. Semuanya dari browser.
            </p>

            <ol className="mt-10 grid gap-4 sm:grid-cols-3">
              {startSteps.map((step, index) => (
                <li key={step.title} className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-paper)] p-6">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-highlight)] font-[family-name:var(--font-display)] text-sm font-extrabold">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pp-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="fitur">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Fitur</p>
            <h2 className="pp-section-title mt-3">Yang bisa kamu pakai.</h2>
            <p className="pp-page-description">
              Semua paket mendapat fitur yang sama. Yang membedakan hanya batas pemakaiannya.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-6">
                  <span aria-hidden="true" className={`mb-4 grid h-10 w-10 place-items-center rounded-lg border border-[var(--pp-ink)] ${feature.tone}`}>
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-lg font-bold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pp-muted)]">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="pp-eyebrow">Untuk pengembang</p>
                <h2 className="pp-section-title mt-3">Pakai WhatsApp sebagai alat untuk AI dan otomasi.</h2>
                <p className="pp-page-description">
                  Satu panggilan API, pesan masuk antrian. Pasangkan dengan ChatGPT, Claude, Google
                  Sheets, toko online, atau sistem internal Anda.
                </p>

                <dl className="mt-8 space-y-5">
                  {queueGuarantees.map((item) => (
                    <div key={item.title}>
                      <dt className="font-semibold">{item.title}</dt>
                      <dd className="mt-1 text-sm leading-relaxed text-[var(--pp-muted)]">{item.body}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <div className="overflow-hidden rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-ink)]">
                  <div className="border-b border-[#2e4a10] px-5 py-3 font-[family-name:var(--font-mono-ui)] text-xs font-bold text-[var(--pp-mint)]">
                    POST /api/v1/messages/text
                  </div>
                  <pre className="overflow-x-auto px-5 py-4 font-[family-name:var(--font-mono-ui)] text-xs leading-relaxed text-[#dff3d0]">
{`curl -X POST https://pesanpro.kingofcoding.my.id/api/v1/messages/text \\
  -H "x-api-key: <kunci-api>" \\
  -H "Idempotency-Key: 7f3c1a90-2b6e-4d18-9a55-1c0e2f8b4d61" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sessionId": "<id-sesi>",
    "recipient": "628123456789",
    "text": "Pesanan Anda sudah dikirim."
  }'`}
                  </pre>
                </div>
                <p className="mt-3 text-sm text-[var(--pp-muted)]">
                  Angka dan kunci di atas adalah contoh. Ganti dengan milik akun Anda.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-mint)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <p className="pp-eyebrow">Privasi</p>
                <h2 className="pp-section-title mt-3">Kami tidak menyimpan isi pesan Anda.</h2>
                <p className="pp-page-description">
                  PesanPro meneruskan pesan ke sistem Anda. Setelah itu tidak ada alasan bagi kami untuk
                  menyimpannya, jadi memang tidak kami simpan.
                </p>

                <div className="mt-8 grid gap-6 sm:grid-cols-2">
                  {privacyCommitments.map((item) => (
                    <div key={item.title}>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--pp-muted)]">{item.body}</p>
                    </div>
                  ))}
                </div>

                <p className="mt-8 text-sm">
                  <Link href="/privacy" className="font-semibold underline decoration-[var(--pp-line)] underline-offset-4 transition-colors hover:decoration-[var(--pp-ink)]">
                    Baca kebijakan privasi
                  </Link>
                </p>
              </div>

              <div className="justify-self-center self-center">
                <Image
                  src="/brand/maskot-senang.png"
                  alt="Maskot PesanPro dengan ekspresi senang dan sayap terbuka"
                  width={336}
                  height={328}
                  className="h-auto w-40 sm:w-48 lg:w-full lg:max-w-[220px]"
                />
              </div>
            </div>
          </div>
        </section>

        {plans.length > 0 && (
          <section id="harga" className="border-t border-[var(--pp-line)]">
            <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
              <p className="pp-eyebrow">Harga</p>
              <h2 className="pp-section-title mt-3">Harga jelas, tanpa biaya tersembunyi.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
                Angka di bawah dibaca langsung dari paket yang sedang aktif, jadi sama dengan yang
                berlaku di akun Anda. Pembayaran lewat transfer manual, diverifikasi admin.
              </p>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {plans.map((plan) => {
                  const saving = yearlySaving(plan.priceMonthly, plan.priceYearly);
                  return (
                    <div key={plan.id} className="flex flex-col rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-6">
                      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">{plan.name}</h3>
                      <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight">
                        {formatPrice(plan.priceMonthly, plan.currency)}
                        <span className="ml-1 text-sm font-semibold text-[var(--pp-muted)]">/bulan</span>
                      </p>
                      <p className="mt-1 text-sm text-[var(--pp-muted)]">
                        {plan.priceYearly
                          ? `Tahunan ${formatPrice(plan.priceYearly, plan.currency)}${saving ? ` · hemat ${saving.percent}%` : ""}`
                          : "Tidak tersedia tahunan"}
                      </p>
                      <ul className="mt-5 space-y-2.5 text-sm">
                        {[
                          { label: "Perangkat WhatsApp", value: formatLimit("count", entitlementLimit(plan.entitlements, "DEVICES")) },
                          { label: "Pesan per bulan", value: formatLimit("count", entitlementLimit(plan.entitlements, "MESSAGES_MONTHLY")) },
                          { label: "API + Webhook + Auto-reply", value: null },
                          { label: "Penyimpanan media", value: formatLimit("bytes", entitlementLimit(plan.entitlements, "MEDIA_STORAGE_BYTES")) },
                        ].map((row) => (
                          <li key={row.label} className="flex gap-2.5">
                            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />
                            <span>
                              {row.label}
                              {row.value && <span className="text-[var(--pp-muted)]">: {row.value}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Link href="/auth/register" className="mt-6">
                        <Button className="w-full rounded-lg">Daftar {plan.name}</Button>
                      </Link>
                    </div>
                  );
                })}
              </div>

              <details className="mt-8 rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] px-5 py-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  Lihat perbandingan lengkap semua batasan paket
                </summary>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[44rem] border-collapse text-sm">
                    <caption className="sr-only">Perbandingan paket {appName}</caption>
                    <thead>
                      <tr className="bg-[var(--pp-mint)]">
                        <th scope="col" className="border border-[var(--pp-line)] px-4 py-3 text-left font-semibold">
                          Rincian
                        </th>
                        {plans.map((plan) => (
                          <th key={plan.id} scope="col" className="border border-[var(--pp-line)] px-4 py-3 text-left">
                            <span className="block font-bold">{plan.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_ROWS.map((row) => (
                        <tr key={row.feature} className="bg-[var(--pp-paper)]">
                          <th scope="row" className="border border-[var(--pp-line)] px-4 py-2 text-left font-medium">
                            {row.label}
                          </th>
                          {plans.map((plan) => (
                            <td key={plan.id} className="border border-[var(--pp-line)] px-4 py-2 tabular-nums">
                              {formatLimit(row.kind, entitlementLimit(plan.entitlements, row.feature))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </section>
        )}

        <section id="faq" className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="pp-section-title text-center">Pertanyaan yang sering muncul.</h2>

            <div className="mt-10 space-y-3">
              {faq.map((item) => (
                <details key={item.question} className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)] px-5 py-4">
                  <summary className="cursor-pointer list-none font-semibold">
                    {item.question}
                  </summary>
                  <p className="pt-3 text-sm leading-relaxed text-[var(--pp-muted)]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)] py-16">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <div className="rounded-2xl border border-[var(--pp-ink)] bg-[var(--pp-ink)] px-8 py-14 text-center text-[var(--pp-paper)]">
              <h2 className="pp-section-title text-[var(--pp-paper)]">Siap memindahkan WhatsApp bisnis ke satu tempat?</h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#c9d6bc]">
                Daftar, pilih paket, dan unggah bukti transfer. Setelah disetujui, hubungkan nomor lewat
                QR dan kirim pesan pertama hari itu juga.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Link href="/auth/register">
                  <Button size="lg" className="pp-accent-yellow rounded-lg px-8 text-base text-[var(--pp-ink)]">
                    Daftar sekarang
                  </Button>
                </Link>
                <Link href="/docs">
                  <Button size="lg" variant="outline" className="rounded-lg border-[#4a6a20] bg-transparent px-8 text-base text-[var(--pp-paper)] hover:bg-[#2e4a10] hover:text-[var(--pp-paper)]">
                    Baca dokumentasi
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)]">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <Image src="/brand/logo-lockup.png" alt={appName} width={1730} height={514} className="h-8 w-auto" />
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--pp-muted)]">
                Gateway WhatsApp untuk bisnis, dikelola dari satu dashboard dan tersambung ke sistem
                Anda lewat API.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
              <Link href="#fitur" className="hover:text-[var(--pp-terracotta)]">Fitur</Link>
              <Link href="#harga" className="hover:text-[var(--pp-terracotta)]">Harga</Link>
              <Link href="#faq" className="hover:text-[var(--pp-terracotta)]">FAQ</Link>
              <Link href="/docs" className="hover:text-[var(--pp-terracotta)]">Dokumentasi</Link>
              <Link href="/privacy" className="hover:text-[var(--pp-terracotta)]">Kebijakan privasi</Link>
              <Link href={signedIn ? "/dashboard" : "/auth/login"} className="hover:text-[var(--pp-terracotta)]">
                {signedIn ? "Dashboard" : "Masuk"}
              </Link>
              <Link href="/auth/register" className="hover:text-[var(--pp-terracotta)]">Daftar</Link>
            </nav>
          </div>
          <p className="mt-8 text-xs text-[var(--pp-muted)]">
            © {new Date().getFullYear()} {appName} · pesanpro.kingofcoding.my.id
          </p>
        </div>
      </footer>
    </div>
  );
}
