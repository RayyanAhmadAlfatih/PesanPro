"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import Link from "next/link";
import {
    LayoutDashboard,
    Users,
    Settings,
    LogOut,
    QrCode,
    Webhook,
    CalendarClock,
    Bell,
    Inbox,
    Megaphone,
    Activity,
    MessageCircleReply,
    CreditCard,
    BadgeDollarSign,
    ListRestart,
    Code2,
    BookOpen,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import pkg from "../../../package.json";
import { canAccessDashboardPath } from "@/lib/access-policy";

interface NavGroup {
    label: string;
    items: { href: string; label: string; icon: React.ElementType; external?: boolean }[];
}

const navGroups: NavGroup[] = [
    {
        label: "Main",
        items: [
            { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
            { href: "/dashboard/sessions", label: "Perangkat & QR", icon: QrCode },
        ],
    },
    {
        label: "Pengiriman",
        items: [
            { href: "/dashboard/message-queue", label: "Antrian Pesan", icon: ListRestart },
            { href: "/dashboard/broadcast", label: "Kirim Massal", icon: Megaphone },
            { href: "/dashboard/scheduler", label: "Jadwal Kirim", icon: CalendarClock },
            { href: "/dashboard/autoreply", label: "Balasan Otomatis", icon: MessageCircleReply },
        ],
    },
    {
        label: "Integrasi",
        items: [
            { href: "/dashboard/developer", label: "Kunci API", icon: Code2 },
            { href: "/dashboard/webhooks", label: "Webhook", icon: Webhook },
        ],
    },
    {
        label: "Akun",
        items: [
            { href: "/dashboard/billing", label: "Tagihan", icon: CreditCard },
            { href: "/dashboard/settings", label: "Pengaturan", icon: Settings },
            { href: "/dashboard/inbox", label: "Notifikasi", icon: Inbox },
            { href: "/docs", label: "Dokumentasi", icon: BookOpen },
        ],
    },
    {
        label: "Operasi",
        items: [
            { href: "/dashboard/users", label: "Pengguna", icon: Users },
            { href: "/dashboard/commercial", label: "Operasi Komersial", icon: BadgeDollarSign },
            { href: "/dashboard/system-monitor", label: "Monitor Sistem", icon: Activity },
            { href: "/dashboard/notifications", label: "Kirim Pengumuman", icon: Bell },
        ],
    },
];

export function MobileNav({ appName = "PesanPro" }: { appName?: string }) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[85vw] flex-col border-r border-[var(--pp-ink)] bg-[var(--pp-paper)] p-0 sm:w-[320px]">
                <SheetHeader className="border-b border-[var(--pp-line)] px-5 py-4 text-left">
                    <SheetTitle className="font-[family-name:var(--font-display)] text-xl font-extrabold text-foreground">{appName}</SheetTitle>
                    <SheetDescription className="-mt-1 text-[11px] text-muted-foreground">WhatsApp operations</SheetDescription>
                </SheetHeader>

                <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
                    {navGroups.map((group) => {
                        const visibleItems = group.items.filter((item) => canAccessDashboardPath(userRole, item.href));
                        if (visibleItems.length === 0) return null;

                        return (
                            <div key={group.label} className="mb-1">
                                {group.label !== "Main" && (
                                    <p className="px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                        {group.label}
                                    </p>
                                )}
                                <div className="space-y-0.5">
                                    {visibleItems.map(({ href, label, icon: Icon, external }) => (
                                        <Link
                                            key={href}
                                            href={href}
                                            target={external ? "_blank" : undefined}
                                            onClick={() => setOpen(false)}
                                            className={`
                                                group relative flex min-h-[42px] items-center gap-3 rounded-md border px-3 text-sm font-semibold transition-colors
                                                ${isActive(href)
                                                    ? "border-[var(--pp-ink)] bg-[var(--pp-highlight)] text-[var(--pp-ink)]"
                                                    : "border-transparent text-muted-foreground hover:bg-[var(--pp-mint)] hover:text-foreground"
                                                }
                                            `}
                                        >
                                            <Icon
                                                size={17}
                                                className={`flex-shrink-0 ${isActive(href) ? "text-[var(--pp-ink)]" : "text-muted-foreground group-hover:text-foreground"}`}
                                            />
                                            <span className="truncate">{label}</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </nav>

                <div className="border-t border-[var(--pp-line)] bg-[var(--pp-paper)] p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex size-9 items-center justify-center rounded-md border border-[var(--pp-ink)] bg-[var(--pp-mint)] text-xs font-bold">
                            {session?.user?.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-bold">{session?.user?.name || "User"}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{session?.user?.email}</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                            setOpen(false);
                            await signOut({ callbackUrl: "/auth/login" });
                        }}
                    >
                        <LogOut size={14} /> Keluar
                    </Button>
                    <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground">v{pkg.version}</p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
