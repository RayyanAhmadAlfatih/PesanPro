import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { readGuide } from "@/lib/docs";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await readGuide(slug);
  return {
    title: guide ? `${guide.title} | PesanPro Docs` : "Dokumentasi | PesanPro",
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = await readGuide(slug);
  if (!guide) notFound();

  return (
    <div className="min-h-screen bg-[var(--pp-paper)]">
      <header className="border-b border-[var(--pp-line)]">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/docs" className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            PesanPro Docs
          </Link>
          <Link href="/docs" className="inline-flex items-center gap-1 text-sm text-[var(--pp-muted)] hover:text-[var(--pp-ink)]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Semua panduan
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <article
          className="prose max-w-none prose-headings:font-[family-name:var(--font-display)] prose-headings:text-[var(--pp-ink)] prose-p:text-[var(--pp-ink)]/85 prose-li:text-[var(--pp-ink)]/85 prose-strong:text-[var(--pp-ink)] prose-a:text-[var(--pp-ink)] prose-a:underline prose-a:underline-offset-4 prose-code:text-[var(--pp-ink)] prose-pre:bg-[var(--pp-ink)] prose-pre:text-[var(--pp-paper)] prose-table:text-sm prose-th:text-left prose-blockquote:border-l-[var(--pp-ink)] prose-blockquote:text-[var(--pp-ink)]/80"
          dangerouslySetInnerHTML={{ __html: guide.html }}
        />
      </main>

      <footer className="border-t border-[var(--pp-line)]">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4 py-6 text-xs text-[var(--pp-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>PesanPro v{pkg.version}</span>
        </div>
      </footer>
    </div>
  );
}
