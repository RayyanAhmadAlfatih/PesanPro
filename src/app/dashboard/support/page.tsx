import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, LifeBuoy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatWhatsappDisplay, whatsappHref } from "@/lib/support-contact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bantuan | PesanPro",
};

export default async function SupportPage() {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "default" },
    select: { supportWhatsapp: true },
  });
  const href = whatsappHref(config?.supportWhatsapp, "Halo admin PesanPro, saya butuh bantuan.");
  const display = formatWhatsappDisplay(config?.supportWhatsapp);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header>
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--pp-muted)]">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          Bantuan
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Butuh bantuan?</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--pp-muted)]">
          Tanya langsung ke admin lewat WhatsApp. Sertakan email akun dan langkah yang sudah Anda coba supaya masalahnya cepat ditemukan.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp admin
            </CardTitle>
            <CardDescription>Balasan mengikuti jam kerja admin.</CardDescription>
          </CardHeader>
          <CardContent>
            {href ? (
              <>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums">{display}</p>
                <Button asChild className="mt-4">
                  <a href={href} target="_blank" rel="noreferrer">
                    Chat lewat WhatsApp
                  </a>
                </Button>
                <p className="mt-3 text-xs leading-relaxed text-[var(--pp-muted)]">
                  Nomor ini hanya untuk bantuan. Jangan kirim kata sandi, kode OTP, atau kunci API.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--pp-line)] bg-[var(--pp-paper)] p-4">
                <p className="font-semibold">Nomor bantuan belum diatur</p>
                <p className="mt-1 text-sm text-[var(--pp-muted)]">
                  Admin belum mengisi nomor WhatsApp bantuan. Sampaikan kendala Anda lewat email yang dipakai saat mendaftar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              Panduan
            </CardTitle>
            <CardDescription>Sebagian besar pertanyaan sudah dijawab di sini.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { href: "/docs", label: "Semua panduan" },
              { href: "/docs/08-troubleshooting-faq", label: "Troubleshooting dan FAQ" },
              { href: "/docs/02-broadcast", label: "Cara menjalankan broadcast" },
              { href: "/docs/03-auto-reply", label: "Mengatur balasan otomatis" },
              { href: "/docs/05-api-developer", label: "API untuk developer" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-[var(--pp-paper)]"
              >
                <span>{item.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-[var(--pp-muted)]" aria-hidden="true" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-[var(--pp-line)] bg-[var(--pp-white)] p-4">
        <p className="text-sm font-semibold">Agar cepat ditangani, sertakan:</p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--pp-muted)]">
          <li>Email akun dan nama perangkat yang bermasalah.</li>
          <li>Waktu kejadian dan langkah yang sudah dicoba.</li>
          <li>Screenshot pesan error, tanpa menampilkan kata sandi atau kunci API.</li>
        </ul>
      </div>
    </div>
  );
}
