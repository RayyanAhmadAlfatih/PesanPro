import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { listGuides } from "@/lib/docs";
import pkg from "../../../package.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Dokumentasi | PesanPro",
  description: "Panduan PesanPro untuk pemilik usaha dan developer: broadcast, auto-reply, API, webhook, dan operasional.",
};

export default async function DocsPage() {
  const guides = await listGuides();

  return (
    <div className="min-h-screen bg-[var(--pp-paper)]">
      <header className="border-b border-[var(--pp-line)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            PesanPro Docs
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)]">
              Beranda
            </Link>
            <Link href="/auth/login" className="text-[var(--pp-muted)] transition-colors hover:text-[var(--pp-ink)]">
              Masuk
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-sm font-semibold text-[var(--pp-muted)]">Dokumentasi</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Panduan PesanPro</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
          Panduan untuk pemilik usaha dan developer. Semua contoh memakai fitur yang benar-benar ada di aplikasi.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/docs/${guide.slug}`}
              className="group flex h-full flex-col rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-5 transition-colors hover:border-[var(--pp-ink)]"
            >
              <span className="text-base font-semibold">{guide.title}</span>
              {guide.summary ? (
                <span className="mt-2 text-sm leading-relaxed text-[var(--pp-muted)]">{guide.summary}</span>
              ) : null}
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                Baca panduan
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>

        {guides.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-[var(--pp-line)] p-6 text-sm text-[var(--pp-muted)]">
            Panduan belum tersedia di server ini.
          </p>
        ) : null}
      </main>

      <footer className="border-t border-[var(--pp-line)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-[var(--pp-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>PesanPro v{pkg.version}</span>
        </div>
      </footer>
    </div>
  );
}
