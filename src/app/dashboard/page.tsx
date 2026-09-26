import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Wifi, WifiOff, QrCode, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { getAccessibleSessions } from "@/lib/api-auth";
import { redirect } from "next/navigation";
import { canAccessDashboardPath } from "@/lib/access-policy";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sessions = await getAccessibleSessions(session.user.id!, session.user.role || "USER");
  const totalSessions = sessions.length;
  const connectedSessions = sessions.filter((item) => item.status === "CONNECTED").length;
  const disconnectedSessions = totalSessions - connectedSessions;

  let autoReplyCount = 0;
  try {
    const sessionIds = sessions.map((item) => item.sessionId);
    if (sessionIds.length > 0) autoReplyCount = await prisma.autoReply.count({ where: { sessionId: { in: sessionIds } } });
  } catch {
    // Keep the dashboard usable while an optional migration is not yet applied.
  }

  const stats = [
    { title: "Total sessions", value: totalSessions, detail: "Perangkat terdaftar", accent: "" },
    { title: "Connected", value: connectedSessions, detail: "Online & siap", accent: "pp-accent-mint" },
    { title: "Disconnected", value: disconnectedSessions, detail: "Perlu koneksi ulang", accent: disconnectedSessions > 0 ? "pp-accent-yellow" : "" },
    { title: "Auto-reply rules", value: autoReplyCount, detail: "Aturan tersimpan", accent: "pp-accent-teal" },
  ];

  const quickActions = [
    { href: "/dashboard/sessions", label: "Sessions / QR", description: "Hubungkan dan kelola perangkat" },
    { href: "/dashboard/campaigns", label: "Campaigns", description: "Siapkan pengiriman bertahap" },
    { href: "/dashboard/message-queue", label: "Message Queue", description: "Pantau status pengiriman pesan" },
    { href: "/dashboard/webhooks", label: "Webhook API", description: "Kelola endpoint dan kredensial" },
  ].filter((action) => canAccessDashboardPath(session.user.role, action.href));

  return (
    <div className="space-y-8">
      <header className="pp-page-head">
        <div>
          <span className="pp-eyebrow">Workspace tenant</span>
          <h1 className="pp-page-title">Dashboard</h1>
          <p className="pp-page-description">Pantau koneksi WhatsApp, automasi, dan pekerjaan yang perlu ditangani dari satu ruang kerja.</p>
        </div>
        <Button asChild><Link href="/dashboard/sessions"><Plus /> Tambah session</Link></Button>
      </header>

      <section aria-labelledby="quick-title">
        <div className="mb-3 flex items-end justify-between gap-4"><div><h2 id="quick-title" className="pp-section-title">Akses cepat</h2><p className="mt-1 text-sm text-muted-foreground">Mulai pekerjaan utama tanpa mencari menu.</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => <Link key={action.href} href={action.href} className="rounded-lg border border-[var(--pp-ink)] bg-[var(--pp-paper)] p-4 transition-[transform,box-shadow,background-color] duration-150 hover:-translate-x-px hover:-translate-y-px hover:bg-[var(--pp-mint)] hover:shadow-[2px_2px_0_var(--pp-ink)]"><strong>{action.label}</strong><span className="mt-1 block text-sm text-muted-foreground">{action.description}</span></Link>)}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Ringkasan tenant">
        {stats.map((stat) => <Card key={stat.title} className={stat.accent}><CardContent className="p-5"><strong className="block font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{stat.value}</strong><span className="mt-2 block text-sm font-bold">{stat.title}</span><em className="mt-1 block text-xs not-italic text-muted-foreground">{stat.detail}</em></CardContent></Card>)}
      </section>

      {disconnectedSessions > 0 && (
        <section aria-labelledby="attention-title">
          <div className="mb-3"><h2 id="attention-title" className="pp-section-title">Perlu tindakan</h2><p className="mt-1 text-sm text-muted-foreground">Ada session yang tidak sedang terhubung.</p></div>
          <Card className="pp-accent-yellow"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{disconnectedSessions} session perlu diperiksa</p><p className="mt-1 text-sm">Hubungkan ulang perangkat sebelum menjalankan pengiriman yang bergantung pada session tersebut.</p></div><Button asChild variant="outline"><Link href="/dashboard/sessions">Periksa session</Link></Button></CardContent></Card>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-4"><div><h2 className="pp-section-title">Session overview</h2><p className="mt-1 text-sm text-muted-foreground">Kondisi perangkat pada workspace ini.</p></div><Link href="/dashboard/sessions" className="flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline">Kelola semua <ArrowRight size={16} /></Link></div>
        {sessions.length === 0 ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center"><div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-md border border-[var(--pp-line)] bg-white"><QrCode /></div><p className="font-bold">Belum ada session</p><p className="mt-1 text-sm text-muted-foreground">Hubungkan perangkat WhatsApp pertama untuk mulai menggunakan PesanPro.</p><Button asChild variant="outline" className="mt-4"><Link href="/dashboard/sessions"><Plus /> Buat session</Link></Button></CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--pp-line)] bg-white">
            <table>
              <thead><tr><th>Nama</th><th>Session ID</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>{sessions.map((item) => { const connected = item.status === "CONNECTED"; return <tr key={item.id}><td><div className="flex items-center gap-3"><span className={`flex size-9 items-center justify-center rounded-md border border-[var(--pp-ink)] ${connected ? "bg-[var(--pp-mint)]" : "bg-[var(--pp-blush)]"}`}>{connected ? <Wifi size={16} /> : <WifiOff size={16} />}</span><strong>{item.name}</strong></div></td><td className="font-mono text-xs">{item.sessionId}</td><td><span className={`inline-flex rounded-full border border-[var(--pp-ink)] px-2.5 py-1 text-xs font-bold ${connected ? "bg-[var(--pp-mint)]" : "bg-[var(--pp-blush)]"}`}>{item.status}</span></td><td><Button asChild size="sm" variant="outline"><Link href={`/dashboard/sessions/${item.sessionId}`}>Detail</Link></Button></td></tr>; })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
