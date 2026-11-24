"use client";

// Komponen interaktif landing page. Sengaja dipisah dari page.tsx (server
// component) karena butuh state dan efek browser. MOTION dial DESIGN.md:
// angka statistik beranimasi sekali saat terlihat, kalkulator murni fungsional,
// tidak ada loop animasi. prefers-reduced-motion dihormati.

import { useEffect, useRef, useState } from "react";

const STATS = [
  {
    value: 90.8,
    decimals: 1,
    suffix: "%",
    body: "pengguna internet Indonesia (usia 16+) memakai WhatsApp dalam satu bulan terakhir",
    source: "Sumber: DataReportal, Digital 2026: Indonesia",
  },
  {
    value: 229.4,
    decimals: 1,
    suffix: " juta",
    body: "orang Indonesia terhubung internet, atau 80,66% populasi",
    source: "Sumber: APJII, Survei Profil Internet Indonesia 2025",
  },
  {
    value: 36.5,
    decimals: 1,
    suffix: "%",
    body: "menyebut WhatsApp platform favorit mereka, tertinggi di atas TikTok (22,6%)",
    source: "Sumber: DataReportal, Digital 2026: Indonesia",
  },
];

function formatStat(value: number, decimals: number) {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function StatItem({
  value,
  decimals,
  suffix,
  body,
  source,
}: (typeof STATS)[number]) {
  const ref = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [display, setDisplay] = useState(() => formatStat(0, decimals));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // setState selalu lewat callback rAF/IO (tidak sinkron di body effect)
    // agar tidak memicu render berantai sesuai aturan react-hooks.
    if (!("IntersectionObserver" in window)) {
      const raf = requestAnimationFrame(() => setDisplay(formatStat(value, decimals)));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || startedRef.current) continue;
          startedRef.current = true;
          io.unobserve(entry.target);
          const durasi = reduceMotion ? 0 : 1200;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = durasi === 0 ? 1 : Math.min((now - start) / durasi, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(formatStat(value * eased, decimals));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, decimals]);

  return (
    <div ref={ref} className="text-center">
      <p className="font-[family-name:var(--font-display)] text-4xl font-extrabold leading-none tracking-tight text-[var(--pp-highlight)] sm:text-5xl">
        <span className="tabular-nums">{display}</span>
        {suffix}
      </p>
      <p className="mt-3 text-sm leading-relaxed">{body}</p>
      <p className="mt-2 text-xs text-[var(--pp-mint)]">{source}</p>
    </div>
  );
}

export function StatBand() {
  return (
    <section className="bg-[var(--pp-ink)] text-[var(--pp-paper)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          {STATS.map((stat) => (
            <StatItem key={stat.source + stat.body} {...stat} />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-[var(--pp-mint)]">
          Artinya: pelanggan Anda memang ada di WhatsApp. Yang menentukan penjualan adalah seberapa cepat chat itu dijawab.
        </p>
      </div>
    </section>
  );
}

export function KalkulatorWaktu() {
  const [chat, setChat] = useState("");
  const [menit, setMenit] = useState("");
  const [status, setStatus] = useState<"kosong" | "error" | "hasil">("kosong");
  const [jamBulan, setJamBulan] = useState(0);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const jumlahChat = Number(chat);
    const jumlahMenit = Number(menit);
    const valid =
      Number.isFinite(jumlahChat) &&
      Number.isFinite(jumlahMenit) &&
      jumlahChat > 0 &&
      jumlahMenit > 0;
    if (!valid) {
      setStatus("error");
      return;
    }
    setJamBulan((jumlahChat * jumlahMenit * 26) / 60);
    setStatus("hasil");
  }

  return (
    <div className="rounded-xl bg-[var(--pp-mint)] p-6 sm:p-10">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h3 className="pp-section-title">Hitung sendiri, dua angka saja</h3>
          <p className="pp-page-description">
            Tidak perlu percaya klaim siapa pun, termasuk halaman ini. Masukkan dua angka dari
            pengalaman Anda sendiri, dan lihat berapa jam yang hilang tiap bulan hanya untuk
            mengetik ulang.
          </p>
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="kalkulator-chat" className="block text-sm font-semibold">
                Rata-rata chat pelanggan per hari
              </label>
              <input
                id="kalkulator-chat"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="contoh: 40"
                className="mt-1.5 w-full rounded-md border border-[var(--pp-ink)] bg-[var(--pp-white)] px-3 py-2.5 text-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-highlight)]"
              />
            </div>
            <div>
              <label htmlFor="kalkulator-menit" className="block text-sm font-semibold">
                Menit yang Anda habiskan untuk membalas satu chat
              </label>
              <input
                id="kalkulator-menit"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={menit}
                onChange={(e) => setMenit(e.target.value)}
                placeholder="contoh: 5"
                className="mt-1.5 w-full rounded-md border border-[var(--pp-ink)] bg-[var(--pp-white)] px-3 py-2.5 text-sm focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-highlight)]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-[var(--pp-ink)] bg-[var(--pp-ink)] px-6 text-sm font-semibold text-[var(--pp-white)] transition-colors hover:bg-[var(--pp-highlight)] hover:text-[var(--pp-ink)]"
            >
              Hitung estimasi
            </button>
            {status === "error" && (
              <p role="alert" className="text-sm font-semibold text-[var(--pp-danger)]">
                Isi kedua kolom dengan angka lebih dari nol.
              </p>
            )}
          </form>
        </div>

        <div aria-live="polite">
          {status === "hasil" ? (
            <div className="rounded-r-xl border-l-4 border-[var(--pp-ink)] bg-[var(--pp-white)] p-6">
              <p className="text-xs uppercase tracking-wide text-[var(--pp-muted)]">
                Perkiraan waktu mengetik chat per bulan (26 hari kerja):
              </p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-extrabold tabular-nums">
                {jamBulan.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam
              </p>
              <p className="mt-2 text-sm">
                Setara{" "}
                <strong>
                  {(jamBulan / 8).toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari
                  kerja penuh
                </strong>{" "}
                (8 jam per hari).
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[var(--pp-muted)]">
                Ini hitungan aritmetika sederhana dari isian Anda sendiri, bukan hasil riset.
                Gunakan sebagai gambaran kasar, bukan janji. Yang jelas: waktu ini berulang
                setiap bulan selama pembalasan masih manual.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-6">
              <p className="text-sm text-[var(--pp-muted)]">
                Hasil perhitungan akan muncul di sini setelah Anda mengisi dua angka di sebelah
                kiri dan menekan tombol hitung.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
