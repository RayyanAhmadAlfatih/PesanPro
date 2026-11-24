import Link from "next/link";
import Image from "next/image";
import {
  BellRing,
  Bot,
  CalendarClock,
  Check,
  ImageDown,
  MessageSquareReply,
  Plug,
  Smartphone,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { buildPlanCatalog } from "@/lib/promo-service";
import { cn } from "@/lib/utils";
import { KalkulatorWaktu, StatBand } from "@/components/landing/lp-interactive";

// HTML must always reference the assets from the currently running build.
// Hashed /_next/static assets remain immutable and cacheable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const appName = process.env.APP_NAME?.trim() || "PesanPro";

export const metadata = {
  title: `${appName} | Gateway WhatsApp untuk bisnis yang terjangkau`,
  description:
    "Gateway WhatsApp untuk bisnis yang terjangkau, mulai Rp20.000 per bulan. Hubungkan nomor lewat QR, kirim notifikasi, broadcast, dan balasan otomatis dari dashboard atau REST API.",
  openGraph: {
    title: `${appName} | Gateway WhatsApp untuk bisnis yang terjangkau`,
    description:
      "Hubungkan nomor WhatsApp lewat QR, lalu kirim notifikasi, broadcast, dan balasan otomatis dari dashboard atau REST API. Mulai Rp20.000 per bulan.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://pesanpro.kingofcoding.my.id",
  },
  twitter: {
    card: "summary_large_image",
    title: `${appName} | Gateway WhatsApp untuk bisnis yang terjangkau`,
    description:
      "Gateway WhatsApp untuk bisnis yang terjangkau, mulai Rp20.000 per bulan. Dashboard, REST API, dan webhook dalam satu tempat.",
  },
};

// Narasi masalah: hari kerja yang berulang, dibaca sebagai hipotesis diri
// pembaca, bukan statistik. Setiap angka di halaman ini punya sumber atau
// berasal dari isian pengguna di kalkulator.
const masalahCerita = [
  'Jam 8 pagi, pesanan pertama masuk. Anda ketik konfirmasi, salin nomor resi, kirim. Jam 10, ada yang tanya stok. Pertanyaan yang sama dengan yang masuk jam 9 kemarin, dan jam 9 seminggu lalu. Anda ketik ulang jawaban yang sama, untuk kesekian kalinya.',
  'Jam 1 siang, Anda sedang mengantar barang ke kurir. Ponsel bergetar lima kali. Anda tahu itu pelanggan yang menunggu jawaban. Anda juga tahu sebagian dari mereka bisa saja membuka toko pesaing sambil menunggu.',
  'Jam 9 malam, keluarga sudah di meja makan. Layar menyala: "Kak, masih buka tidak?". Membalas berarti kembali bekerja. Tidak membalas berarti menonton chat itu terbaca, tanpa jawaban, sampai besok pagi.',
  'Dan Anda tidak akan pernah tahu berapa banyak orang yang tidak mengetik apa-apa. Mereka membandingkan toko Anda dengan toko lain di tab bersebelahan, memilih yang membalas lebih dulu, lalu pergi tanpa meninggalkan jejak.',
  'Ini bukan soal kerja keras. Anda sudah bekerja keras. Masalahnya, satu nomor WhatsApp tidak dirancang untuk menggantikan tiga pekerjaan sekaligus: layanan pelanggan, pengirim notifikasi, dan mesin pemasaran ulang. Ketiga pekerjaan itu tetap harus jalan. Pertanyaannya cuma satu: diketik oleh tangan Anda, atau dijalankan sistem?',
];

const solusiPembuka = [
  'PesanPro adalah WhatsApp gateway. Satu dashboard yang menjalankan pekerjaan WhatsApp bisnis Anda secara otomatis, tanpa Anda mengetik semuanya.',
  'Caranya sederhana. Anda memindai QR dari ponsel (seperti saat login WhatsApp Web), lalu menyetel aturannya sekali. Setelah itu:',
];

const solusiPoin = [
  {
    label: 'Notifikasi resi dan status pesanan',
    body: 'terkirim sendiri begitu sistem toko Anda memanggil API.',
  },
  {
    label: 'Pertanyaan "harga", "stok", "jam buka"',
    body: 'dijawab langsung lewat kata kunci, termasuk di luar jam kerja.',
  },
  {
    label: 'Daftar 500 sampai 3.000 penerima',
    body: 'menerima broadcast yang sama, dengan jeda otomatis yang menjaga ritme kirim.',
  },
];

const solusiPenutup =
  'Sekali disetel, berulang setiap hari. Tangan Anda kembali ke pekerjaan yang benar-benar menambah penjualan.';

// Screenshot halaman dashboard yang sebenarnya (bukan ilustrasi). Nama akun,
// email, dan jam di gambar sudah diganti contoh sebelum gambar dirender.
const alurLangkah = [
  {
    src: '/lp/langkah-hubungkan.png',
    caption: 'Langkah 1: hubungkan perangkat WhatsApp',
    alt: 'Halaman Kelola sesi di dashboard PesanPro: form membuat sesi baru dan daftar sesi aktif',
  },
  {
    src: '/lp/langkah-atur.png',
    caption: 'Langkah 2: setel balasan otomatis sekali saja',
    alt: 'Halaman Balasan Otomatis di dashboard PesanPro: satu aturan aktif dengan kata kunci dan teks jawaban',
  },
  {
    src: '/lp/langkah-kirim.png',
    caption: 'Langkah 3: kirim dan pantau sampai dibaca',
    alt: 'Halaman Antrian Pesan di dashboard PesanPro: status tiap pesan dari terkirim sampai dibaca, dengan percobaan ulang otomatis',
  },
];

// Ikon lucide dipilih karena relevan langsung dengan tiap fitur dan konsisten
// dengan stack ikon aplikasi (bukan ikon dekoratif generik).
const fiturPendukung = [
  {
    icon: BellRing,
    title: "Notifikasi otomatis lewat API",
    body: "Sistem toko atau aplikasimu memanggil API, pesanan dan nomor resi terkirim ke WhatsApp pelanggan tanpa diketik ulang.",
  },
  {
    icon: MessageSquareReply,
    title: "Balasan otomatis kata kunci",
    body: 'Pelanggan mengetik "harga" atau "jam buka", jawaban terkirim langsung, termasuk di luar jam kerja.',
  },
  {
    icon: CalendarClock,
    title: "Pesan terjadwal",
    body: "Siapkan pesannya sekarang, kirim pada waktu yang Anda tentukan. Cocok untuk pengingat bayar dan follow up.",
  },
  {
    icon: Webhook,
    title: "Webhook untuk setiap kejadian",
    body: "PesanPro memberi tahu server Anda saat ada pesan masuk atau status pengiriman berubah, dengan tanda tangan supaya bisa diverifikasi.",
  },
  {
    icon: Bot,
    title: "Sambungkan ke AI",
    body: "Pesan masuk diteruskan lewat webhook ke ChatGPT atau Claude, balasannya dikirim kembali ke pelanggan. Panduan lengkap dalam Bahasa Indonesia.",
  },
  {
    icon: Plug,
    title: "Integrasi tanpa kode",
    body: "Contact Form 7, Google Forms, WooCommerce, dan WordPress bisa mengirim WhatsApp tanpa membangun aplikasi baru.",
  },
  {
    icon: Smartphone,
    title: "Banyak nomor dalam satu akun",
    body: "Pisahkan nomor untuk penjualan, dukungan, dan pengiriman. Jumlahnya mengikuti paket: 1, 3, atau 5 nomor.",
  },
  {
    icon: ImageDown,
    title: "Gambar dikompres otomatis",
    body: "Media diperkecil sebelum dikirim, jadi kuota dan waktu unggah lebih hemat.",
  },
];

const langkahMulai = [
  {
    title: "Daftar, pilih paket, bayar",
    body: "Isi data akun di halaman daftar, pilih paket dan periode, transfer ke rekening yang tampil di halaman itu, lalu unggah bukti transfer. Akun berstatus menunggu sampai admin memeriksa dan menyetujui pembayaran Anda.",
  },
  {
    title: "Hubungkan WhatsApp lewat QR",
    body: "Masuk ke dashboard dan pindai QR dari ponsel, sama seperti login WhatsApp Web. Satu nomor cukup untuk mulai.",
  },
  {
    title: "Kirim pesan pertama",
    body: "Kirim dari dashboard tanpa koding, atau lewat API kalau Anda punya sistem sendiri. Panduan mulai cepat tersedia dalam Bahasa Indonesia, targetnya sekitar 5 menit setelah akun aktif.",
  },
];

// Perbandingan berdasarkan cara kerja, bukan angka promosi.
const perbandingan = [
  {
    kebutuhan: "Pertanyaan berulang (harga, stok, jam buka)",
    manual: "Ketik ulang jawaban yang sama setiap kali masuk",
    sistem: "Auto-reply menjawab kata kunci langsung, termasuk di luar jam kerja",
  },
  {
    kebutuhan: "Notifikasi resi dan status pesanan",
    manual: "Salin dari sistem, tempel ke chat, kirim, ulangi",
    sistem: "Sistem Anda memanggil API sekali, PesanPro mengirim ke pelanggan",
  },
  {
    kebutuhan: "Promosi ke daftar pelanggan",
    manual: "Buka chat satu per satu, ketik, kirim, berulang sampai selesai",
    sistem: "Impor CSV, satu pesan untuk semua, jeda otomatis menjaga ritme",
  },
  {
    kebutuhan: "Pesan untuk besok pagi",
    manual: "Harus diingat dan dikirim tepat waktu, atau lewat",
    sistem: "Disetel sekarang, terkirim di waktu yang Anda pilih",
  },
  {
    kebutuhan: "Nomor penjualan, dukungan, pengiriman",
    manual: "Beberapa ponsel, beberapa aplikasi, sulit dipantau",
    sistem: "Satu dashboard, jumlah nomor mengikuti paket (1, 3, atau 5)",
  },
];

const privacyCommitments = [
  {
    title: "Isi pesan disimpan maksimal 30 hari",
    body: "Teks dan caption disimpan untuk antrean pengiriman dan debugging, lalu dihapus otomatis setelah 30 hari.",
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

// Gabungan pertanyaan LP dan FAQ aplikasi yang sudah terverifikasi. Jawaban
// blokir sengaja jujur: tidak ada jaminan, yang ada hanya penurunan risiko.
const faq = [
  {
    question: "Apakah ada paket gratis atau trial?",
    answer:
      "Tidak. PesanPro berbayar sejak awal, dan akun baru aktif setelah pembayaran disetujui admin.",
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
    question: "Apakah PesanPro membaca isi pesan saya?",
    answer:
      "Kami tidak membaca isi pesan Anda untuk keperluan lain selain pengiriman dan debugging. Pesan disimpan maksimal 30 hari, lalu dihapus otomatis. Pesan yang masuk juga diteruskan ke webhook milik Anda, dan riwayat percakapan lama tidak kami tarik dari WhatsApp.",
  },
  {
    question: "Apakah nomor WhatsApp saya bisa diblokir?",
    answer:
      "Ada kemungkinan. WhatsApp bisa membatasi nomor yang tertaut ke layanan pihak ketiga, dan risiko itu tidak bisa kami jamin nol. Yang bisa kami lakukan adalah menjaga aktivitas tetap wajar: jeda otomatis antar pesan, batas laju per nomor, dan daftar opt-out yang dihormati. Kalau nomor Anda penting, pakai nomor terpisah dari nomor utama.",
  },
  {
    question: "Apakah saya perlu nomor WhatsApp baru?",
    answer:
      "Disarankan memakai nomor khusus usaha. Nomor pribadi bisa dipakai, tetapi lebih rawan tercampur dengan percakapan pribadi.",
  },
  {
    question: "Bisakah satu akun memakai beberapa nomor?",
    answer:
      "Bisa. Jumlahnya mengikuti paket: Starter 1 nomor, Bisnis 3 nomor, Pro 5 nomor. Setiap nomor berjalan sebagai sesi terpisah dengan kunci API dan webhook sendiri, jadi Anda bisa memisahkan nomor penjualan dan nomor dukungan tanpa saling mengganggu.",
  },
  {
    question: "Apakah harus selalu menyalakan HP?",
    answer:
      "Hanya sekali, saat memindai kode QR untuk menautkan nomor. Setelah itu pengiriman berjalan dari server. Kalau WhatsApp di HP memutus tautan, dashboard akan menandai sesi itu perlu dihubungkan ulang.",
  },
  {
    question: "Berapa lama data pengiriman disimpan?",
    answer:
      "Metadata pengiriman dan isi pesan disimpan maksimal 30 hari, lalu dihapus otomatis. Media yang Anda unggah untuk dikirim ikut terhapus setelah 30 hari. Media yang masuk ke nomor Anda tidak diunduh ke server kami.",
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

type PlanEntitlements = Array<{ feature: string; enabled: boolean; limitValue: string | bigint | null }>;

function entitlementLimit(entitlements: PlanEntitlements, feature: string) {
  return entitlements.find((item) => item.feature === feature)?.limitValue ?? null;
}

function formatLimit(kind: LimitKind, limitValue: string | bigint | null): string {
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

async function loadPlans(userId?: string | null) {
  try {
    // Pengunjung baru melihat harga promo yang sedang aktif. Tenant lama
    // melihat harga yang sudah terkunci di langganannya, supaya halaman
    // tidak menjanjikan diskon yang tidak berlaku untuk mereka.
    const catalog = await buildPlanCatalog({ userId: userId ?? undefined, includeEntitlements: true });
    return catalog.plans;
  } catch {
    // A pricing table is not worth failing the whole page for.
    return [];
  }
}

export default async function Home() {
  const session = await auth().catch(() => null);
  const plans = await loadPlans(session?.user?.id ?? null);
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

          <nav className="flex items-center gap-5">
            <Link href="#masalah" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Masalah
            </Link>
            <Link href="#kalkulator" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Hitung kerugian
            </Link>
            <Link href="#solusi" className="hidden text-sm font-medium text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)] md:block">
              Solusi
            </Link>
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
        {/* HERO: masalah dulu, baru solusi */}
        <section className="mx-auto w-full max-w-5xl px-4 pb-14 pt-14 sm:px-6 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
                Chat pelanggan datang nonstop.{" "}
                <span className="bg-[linear-gradient(transparent_58%,var(--pp-highlight)_58%)] px-0.5">
                  Tangan Anda cuma dua.
                </span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-[var(--pp-muted)]">
                Pertanyaan harga yang sama dijawab ulang tiap hari. Notifikasi resi disalin manual
                satu per satu. Broadcast diketik nomor demi nomor sampai malam. Semua itu makan
                waktu Anda yang seharusnya dipakai jualan.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-[var(--pp-muted)]">
                {appName} memindahkan pekerjaan itu ke satu dashboard: notifikasi otomatis lewat
                API, broadcast berjeda, dan balasan langsung lewat kata kunci.{" "}
                <strong className="text-[var(--pp-ink)]">
                  Anda tetap jualan, sistem yang mengetik.
                </strong>
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/auth/register">
                  <Button size="lg" className="rounded-lg px-6 text-base">
                    Daftar dan hubungkan WhatsApp
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
              <p className="mt-4 text-sm text-[var(--pp-muted)]">
                Pembayaran lewat transfer bank dan diverifikasi admin. Tanpa kartu kredit.
              </p>
            </div>
            <div>
              <Image
                src="/lp/hero-dashboard.png"
                alt="Tampilan dashboard PesanPro: antrean pesan dan status perangkat terhubung"
                width={1356}
                height={459}
                className="h-auto w-full rounded-xl border border-[var(--pp-line)]"
                priority
              />
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-2xl rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] px-6 py-5 text-center">
            <p className="text-sm text-[var(--pp-muted)]">Uptime layanan dipantau publik 24/7 melalui layanan pemantauan independen.</p>
            <a
              href="https://app.midteknologi.com/pesanpro/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-semibold underline decoration-[var(--pp-line)] underline-offset-4 transition-colors hover:decoration-[var(--pp-ink)]"
            >
              Lihat status uptime terkini
            </a>
          </div>
        </section>

        {/* BAND DATA: setiap angka bersumber */}
        <StatBand />

        {/* CERITA MASALAH */}
        <section id="masalah" className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="pp-section-title">
            Hari yang terasa seperti ini,{" "}
            <span className="bg-[linear-gradient(transparent_58%,var(--pp-highlight)_58%)] px-0.5">
              hampir tiap hari
            </span>
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed">
            {masalahCerita.map((paragraf) => (
              <p key={paragraf.slice(0, 24)}>{paragraf}</p>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="#kalkulator">
              <Button variant="outline" className="rounded-md">
                Hitung dulu waktunya berapa
              </Button>
            </Link>
            <Link href="#solusi">
              <Button variant="outline" className="rounded-md">
                Langsung lihat solusinya
              </Button>
            </Link>
          </div>
        </section>

        {/* KALKULATOR: aritmetika dari isian pengguna, bukan statistik */}
        <section id="kalkulator" className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <KalkulatorWaktu />
        </section>

        {/* SOLUSI */}
        <section id="solusi" className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div className="order-2 grid gap-6 lg:order-1">
              {alurLangkah.map((langkah) => (
                <figure key={langkah.src}>
                  <Image
                    src={langkah.src}
                    alt={langkah.alt}
                    width={1356}
                    height={459}
                    className="h-auto w-full rounded-xl border border-[var(--pp-line)]"
                  />
                  <figcaption className="mt-2 text-sm font-semibold text-[var(--pp-muted)]">
                    {langkah.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <p className="pp-eyebrow">Solusi</p>
              <h2 className="pp-section-title mt-3">
                Sekarang bagian pentingnya: kebocoran itu bisa ditutup
              </h2>
              <div className="mt-6 space-y-4 text-base leading-relaxed">
                {solusiPembuka.map((paragraf) => (
                  <p key={paragraf.slice(0, 24)}>{paragraf}</p>
                ))}
                <ul className="space-y-3">
                  {solusiPoin.map((poin) => (
                    <li key={poin.label} className="flex gap-3">
                      <Check aria-hidden="true" className="mt-1 h-4 w-4 flex-none" />
                      <span>
                        <strong>{poin.label}</strong> {poin.body}
                      </span>
                    </li>
                  ))}
                </ul>
                <p>{solusiPenutup}</p>
              </div>
            </div>
          </div>
        </section>

        {/* FITUR */}
        <section id="fitur" className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
          <p className="pp-eyebrow">Fitur</p>
          <h2 className="pp-section-title mt-3">Sembilan pekerjaan yang berhenti jadi tanggung jawab Anda</h2>
          <p className="pp-page-description">
            Semua di bawah ini sudah jalan di {appName} hari ini, bukan jadwal rilis. Yang paling
            banyak menghemat waktu ada di urutan pertama.
          </p>

          <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
                <span className="bg-[var(--pp-highlight)] px-1">1. Broadcast dengan jeda otomatis</span>
              </h3>
              <p className="mt-4 leading-relaxed">
                Satu pesan untuk seluruh daftar penerima. Impor nomor dari CSV, sisipkan variabel
                seperti {"{nama}"} supaya tiap orang menerima versi namanya sendiri, dan gunakan
                spintax supaya isi pesan bervariasi.
              </p>
              <p className="mt-3 leading-relaxed">
                Sistem menjaga ritme kirim dengan jeda antar pesan. Broadcast 500 sampai 3.000
                penerima per batch berjalan tanpa Anda menekan kirim satu per satu.
              </p>
            </div>
            <div>
              <Image
                src="/lp/broadcast.png"
                alt="Halaman broadcast PesanPro: daftar penerima dari CSV, isi pesan dengan variabel nama, dan jeda otomatis"
                width={1356}
                height={459}
                className="h-auto w-full rounded-xl border border-[var(--pp-line)]"
              />
            </div>
          </div>

          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {fiturPendukung.map((fitur, index) => (
              <div key={fitur.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 flex-none place-items-center rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-paper)]"
                >
                  <fitur.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold tracking-tight">
                    {index + 2}. {fitur.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--pp-muted)]">{fitur.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CARA MULAI */}
        <section id="cara-mulai" className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Cara mulai</p>
            <h2 className="pp-section-title mt-3">Dari daftar sampai pesan pertama terkirim</h2>

            <ol className="mt-10 space-y-8">
              {langkahMulai.map((langkah, index) => (
                <li key={langkah.title} className="flex gap-5">
                  <span className="grid h-14 w-14 flex-none place-items-center rounded-lg bg-[var(--pp-ink)] font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--pp-paper)]">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">{langkah.title}</h3>
                    <p className="mt-2 leading-relaxed text-[var(--pp-muted)]">{langkah.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10">
              <Link href="/auth/register">
                <Button size="lg" className="rounded-lg px-6 text-base">
                  Mulai langkah 1: daftar
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* PERBANDINGAN JUJUR */}
        <section className="border-t border-[var(--pp-line)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Perbandingan</p>
            <h2 className="pp-section-title mt-3">WhatsApp biasa melawan WhatsApp yang dijalankan sistem</h2>
            <p className="pp-page-description">
              Perbandingan ini berdasarkan cara kerja keduanya, bukan angka promosi.
            </p>

            <div className="mt-8 overflow-x-auto rounded-xl border border-[var(--pp-line)]">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <caption className="sr-only">Perbandingan kerja manual dan {appName}</caption>
                <thead>
                  <tr className="bg-[var(--pp-mint)]">
                    <th scope="col" className="border border-[var(--pp-line)] px-4 py-3 text-left font-semibold">
                      Kebutuhan
                    </th>
                    <th scope="col" className="border border-[var(--pp-line)] px-4 py-3 text-left font-semibold">
                      Diketik manual di WhatsApp biasa
                    </th>
                    <th scope="col" className="border border-[var(--pp-line)] bg-[#FFF9DB] px-4 py-3 text-left font-semibold">
                      Dijalankan {appName}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {perbandingan.map((row) => (
                    <tr key={row.kebutuhan} className="bg-[var(--pp-paper)]">
                      <th scope="row" className="border border-[var(--pp-line)] px-4 py-3 text-left font-medium">
                        {row.kebutuhan}
                      </th>
                      <td className="border border-[var(--pp-line)] px-4 py-3">{row.manual}</td>
                      <td className="border border-[var(--pp-line)] bg-[#FFF9DB] px-4 py-3">{row.sistem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* UNTUK PENGEMBANG */}
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

        {/* PRIVASI */}
        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-mint)]">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
            <p className="pp-eyebrow">Privasi</p>
            <h2 className="pp-section-title mt-3">Kami menyimpan pesan Anda maksimal 30 hari.</h2>
            <p className="pp-page-description">
              Isi pesan disimpan maksimal 30 hari untuk keperluan pengiriman dan debugging, lalu
              dihapus otomatis. Meneruskan pesan ke webhook atau sistem Anda bukan berarti kami
              tidak menyimpannya.
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
        </section>

        {/* HARGA: angka dibaca langsung dari paket aktif (promo-aware) */}
        {plans.length > 0 && (
          <section id="harga" className="border-t border-[var(--pp-line)]">
            <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
              <p className="pp-eyebrow">Harga</p>
              <h2 className="pp-section-title mt-3">Harga yang bisa Anda hitung sejak awal</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
                Semua paket mendapat fitur yang sama. Yang berbeda hanya batas pemakaian. Angka di
                bawah dibaca langsung dari paket yang sedang aktif, jadi sama dengan yang berlaku di
                akun Anda. Pembayaran lewat transfer bank, diverifikasi admin.
              </p>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {plans.map((plan) => {
                  const saving = yearlySaving(plan.priceMonthly, plan.priceYearly);
                  return (
                    <div key={plan.id} className="flex flex-col rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-6">
                      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">{plan.name}</h3>
                      {Number(plan.discountMonthly) > 0 && plan.listMonthly ? (
                        <p className="mt-3 text-sm text-[var(--pp-muted)] line-through">
                          {formatPrice(plan.listMonthly, plan.currency)}
                        </p>
                      ) : null}
                      <p className={cn("font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight", Number(plan.discountMonthly) > 0 ? "mt-0.5" : "mt-3")}>
                        {formatPrice(plan.priceMonthly, plan.currency)}
                        <span className="ml-1 text-sm font-semibold text-[var(--pp-muted)]">/bulan</span>
                      </p>
                      {plan.promo ? (
                        <p className="mt-2 inline-flex w-fit rounded-full bg-[var(--pp-highlight)] px-2.5 py-1 text-xs font-semibold">
                          {plan.promo.percent ? `Promo ${plan.promo.percent}%` : plan.promo.name}
                        </p>
                      ) : null}
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

        {/* FAQ */}
        <section id="faq" className="border-t border-[var(--pp-line)] bg-[var(--pp-white)]">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="pp-section-title">Pertanyaan yang paling menentukan keputusan</h2>

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

        {/* CTA AKHIR: future pacing */}
        <section className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)] py-16">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <div className="rounded-2xl border border-[var(--pp-ink)] bg-[var(--pp-ink)] px-8 py-14 text-center text-[var(--pp-paper)]">
              <h2 className="pp-section-title text-[var(--pp-paper)]">
                Tiga bulan dari hari ini, chat jam 9 malam bisa punya dua nasib
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#c9d6bc]">
                Nasib pertama: dijawab otomatis saat Anda duduk bersama keluarga, dan order masuk
                tercatat rapi besok pagi. Nasib kedua: tetap terbaca di layar tanpa jawaban, dan
                pembeli lanjut ke toko sebelah yang membalas lebih dulu. Perbedaan kedua nasib itu
                cuma satu keputusan yang Anda buat hari ini.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Link href="/auth/register">
                  <Button size="lg" className="pp-accent-yellow rounded-lg px-8 text-base text-[var(--pp-ink)]">
                    Daftar sekarang dan aktifkan paket Anda
                  </Button>
                </Link>
                <Link href="/docs">
                  <Button size="lg" variant="outline" className="rounded-lg border-[#4a6a20] bg-transparent px-8 text-base text-[var(--pp-paper)] hover:bg-[#2e4a10] hover:text-[var(--pp-paper)]">
                    Baca dokumentasi
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-xs text-[#c9d6bc]">
                Isi data, transfer, unggah bukti. Akun aktif setelah pembayaran disetujui admin.
              </p>
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
