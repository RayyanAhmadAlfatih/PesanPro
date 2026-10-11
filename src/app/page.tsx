import Link from "next/link";
import Image from "next/image";
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
      "Kirim dan terima WhatsApp lewat REST API. Antrian pesan yang tahan restart, webhook untuk pesan masuk, dan isi pesan tidak disimpan.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://wagateway.kingofcoding.my.id",
  },
  twitter: {
    card: "summary_large_image",
    title: `${appName} | WhatsApp Gateway`,
    description:
      "Kirim dan terima WhatsApp lewat REST API. Antrian pesan yang tahan restart, webhook untuk pesan masuk, dan isi pesan tidak disimpan.",
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

const steps = [
  {
    title: "Hubungkan nomor",
    body: "Buka WhatsApp di HP, pindai kode QR dari dashboard. Setiap nomor berjalan sebagai sesi terpisah, jadi satu akun bisa memegang beberapa nomor.",
  },
  {
    title: "Buat kunci API",
    body: "Pilih scope sesuai kebutuhan integrasi. Setiap kunci bisa dibatasi per alamat IP dan diberi tanggal kedaluwarsa.",
  },
  {
    title: "Kirim pesan",
    body: "Panggil REST API untuk teks, media, dan dokumen. Setiap permintaan membawa idempotency key supaya kiriman ganda tidak terjadi.",
  },
  {
    title: "Terima event",
    body: "Webhook mengirim pesan masuk, perubahan status pengiriman, dan update koneksi ke server Anda.",
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

const faq = [
  {
    question: "Apakah nomor WhatsApp saya bisa diblokir?",
    answer:
      "Ada kemungkinan. WhatsApp bisa membatasi nomor yang tertaut ke layanan pihak ketiga, dan risiko itu tidak bisa kami jamin nol. Yang bisa kami lakukan adalah menjaga aktivitas tetap wajar: jeda acak antar pesan, batas laju per nomor, dan daftar opt-out yang dihormati. Kalau nomor Anda penting, pakai nomor terpisah dari nomor utama.",
  },
  {
    question: "Apakah PesanPro membaca isi pesan saya?",
    answer:
      "Tidak. Isi pesan tidak pernah ditulis ke database kami. Teks diteruskan ke webhook milik Anda, lalu dibuang. Kami juga tidak menyimpan media, dan tidak pernah menarik riwayat percakapan lama.",
  },
  {
    question: "Apa yang terjadi kalau pesan gagal terkirim?",
    answer:
      "Pesan tetap ada di antrian dan dicoba ulang. Antrian disimpan di database dengan masa sewa, jadi pengiriman yang tertunda tetap dilanjutkan setelah server restart. Alasan kegagalan bisa Anda lihat di halaman Antrian Pesan.",
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
      "Metadata pengiriman disimpan 30 hari lalu dihapus otomatis. Isi pesan dan media tidak pernah masuk hitungan karena memang tidak pernah kami simpan.",
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
            <Image src="/brand/maskot-1-netral.png" alt="" width={371} height={501} className="h-9 w-auto" priority />
            <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight">
              {appName}
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link href="#sebelum-sesudah" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Sebelum &amp; sesudah
            </Link>
            <Link href="#cara-kerja" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Cara kerja
            </Link>
            {plans.length > 0 && (
              <Link href="#harga" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
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
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h1 className="text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl">
                Aplikasi Anda butuh kirim WhatsApp?
                <span className="mt-2 block text-[var(--pp-muted)]">Cukup satu API.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--pp-muted)]">
                Hubungkan nomor WhatsApp Anda, lalu kirim pesan dan terima balasan lewat REST API dan webhook.
                Isi pesan tidak kami simpan.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/auth/login">
                  <Button variant="outline" size="lg" className="pp-accent-yellow rounded-lg px-6 text-base">
                    Masuk ke dashboard
                  </Button>
                </Link>
                <Link href="/auth/register" className="text-sm font-semibold underline decoration-[var(--pp-line)] underline-offset-4 transition-colors hover:decoration-[var(--pp-ink)]">
                  Buat akun
                </Link>
              </div>
              <p className="mt-6 text-sm text-[var(--pp-muted)]">
                Tanpa biaya per pesan. Isi pesan tidak disimpan. Berhenti kapan saja.
              </p>
            </div>

            <div className="justify-self-center">
              <Image
                src="/brand/maskot-4-kirim.png"
                alt="Maskot PesanPro, burung merpati, membawa amplop tertutup di paruhnya"
                width={370}
                height={502}
                className="h-auto w-52 sm:w-64 lg:w-full lg:max-w-[320px]"
                priority
              />
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
                      <span aria-hidden="true" className="mt-2 h-px w-4 flex-none bg-[var(--pp-line)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-paper)] p-6">
                <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">Sesudah</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--pp-muted)]">
                  {apiResult.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-px w-4 flex-none bg-[var(--pp-ink)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)]">
              <div className="flex items-center justify-between border-b border-[var(--pp-line)] px-5 py-3">
                <span className="font-[family-name:var(--font-mono-ui)] text-xs font-bold tracking-wide text-[var(--pp-muted)]">
                  POST /api/v1/messages/text
                </span>
                <span className="text-xs text-[var(--pp-muted)]">dijawab 202, pesan masuk antrian</span>
              </div>
              <pre className="overflow-x-auto px-5 py-4 font-[family-name:var(--font-mono-ui)] text-xs leading-relaxed text-[var(--pp-ink)]">
{`curl -X POST https://<domain>/api/v1/messages/text \\
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
            <p className="mt-4 text-sm text-[var(--pp-muted)]">
              Angka dan kunci di atas adalah contoh. Ganti dengan milik akun Anda.
            </p>
          </div>
        </section>

        <section className="border-t border-[var(--pp-line)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Antrian pesan</p>
            <h2 className="pp-section-title mt-3">Pesan yang gagal tidak hilang begitu saja.</h2>
            <p className="pp-page-description">
              Setiap pengiriman disimpan sebagai pekerjaan di database, bukan di memori server. Kalau prosesnya
              berhenti di tengah jalan, pekerjaan itu diklaim ulang dan dilanjutkan setelah server hidup lagi.
            </p>

            <dl className="mt-10 divide-y divide-[var(--pp-line)] border-y border-[var(--pp-line)]">
              {[
                { title: "Masa sewa", body: "Setiap pekerjaan yang sedang dikerjakan punya batas waktu. Kalau pemiliknya mati, pekerjaan itu kembali ke antrian." },
                { title: "Percobaan ulang terbatas", body: "Kegagalan dicoba ulang dengan jeda bertambah, lalu berhenti dengan alasan yang bisa dibaca." },
                { title: "Idempotency key", body: "Permintaan yang sama dikirim dua kali tidak menghasilkan dua pesan, karena setiap permintaan membawa kunci unik." },
              ].map((item) => (
                <div key={item.title} className="grid gap-2 py-5 sm:grid-cols-[220px_1fr] sm:gap-6">
                  <dt className="font-semibold">{item.title}</dt>
                  <dd className="text-sm leading-relaxed text-[var(--pp-muted)]">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="cara-kerja" className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Cara kerja</p>
            <h2 className="pp-section-title mt-3">Empat langkah dari nomor kosong ke pesan pertama.</h2>

            <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--pp-line)] bg-[var(--pp-line)] sm:grid-cols-2">
              {steps.map((step, index) => (
                <li key={step.title} className="bg-[var(--pp-paper)] p-6">
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
                  src="/brand/maskot-2-senang.png"
                  alt="Maskot PesanPro dengan ekspresi senang dan sayap terbuka"
                  width={384}
                  height={496}
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

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
              <div>
                <p className="pp-eyebrow">Pertanyaan umum</p>
                <h2 className="pp-section-title mt-3">Hal yang biasanya ditanyakan lebih dulu.</h2>

                <div className="mt-8 divide-y divide-[var(--pp-line)] border-y border-[var(--pp-line)]">
                  {faq.map((item) => (
                    <details key={item.question} className="group py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                        {item.question}
                        <span
                          aria-hidden="true"
                          className="font-[family-name:var(--font-mono-ui)] text-lg leading-none text-[var(--pp-muted)] transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--pp-muted)]">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div className="justify-self-center self-start">
                <Image
                  src="/brand/maskot-3-bingung.png"
                  alt="Maskot PesanPro dengan ekspresi bingung dan tanda tanya"
                  width={384}
                  height={522}
                  className="h-auto w-40 sm:w-48 lg:w-full lg:max-w-[200px]"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)]">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight sm:text-3xl">
                Siap kirim pesan pertama?
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--pp-muted)]">
                Buat akun, hubungkan satu nomor, dan panggil API. Tidak ada biaya per pesan yang perlu dihitung dulu.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/auth/register">
                <Button variant="outline" size="lg" className="pp-accent-yellow rounded-lg px-6 text-base">
                  Buat akun
                </Button>
              </Link>
              <Link href="/auth/login" className="text-sm font-semibold underline decoration-[var(--pp-line)] underline-offset-4 transition-colors hover:decoration-[var(--pp-ink)]">
                Masuk
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/brand/maskot-1-netral.png" alt="" width={371} height={501} className="h-7 w-auto" />
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
