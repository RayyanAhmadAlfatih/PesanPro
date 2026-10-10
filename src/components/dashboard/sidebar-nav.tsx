"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react";
import {
    LayoutDashboard,
    Users,
    Settings,
    QrCode,
    Webhook,
    CalendarClock,
    Bell,
    Inbox,
    Send,
    Megaphone,
    Activity,
    Tag,
    MessageCircleReply,
    CreditCard,
    BadgeDollarSign,
    ListRestart,
    Code2,
} from "lucide-react";
import { useSidebar } from "./sidebar-context";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { canAccessDashboardPath } from "@/lib/access-policy";

interface NavGroup {
    label: string;
    items: NavItem[];
}

interface NavItem {
    href: string;
    label: string;
    icon: React.ElementType;
    external?: boolean;
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
            { href: "/dashboard/campaigns", label: "Kampanye", icon: Send },
            { href: "/dashboard/labels", label: "Label", icon: Tag },
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

export function SidebarNav() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { isCollapsed, toggleCollapse } = useSidebar();
    const userRole = session?.user?.role;

    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (label: string) => {
        setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
    };

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    return (
        <TooltipProvider delayDuration={0}>
            <nav className="styled-scrollbar flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-4">
                {navGroups.map((group) => {
                    const visibleItems = group.items.filter((item) => canAccessDashboardPath(userRole, item.href));
                    if (visibleItems.length === 0) return null;

                    const isGroupCollapsed = collapsedGroups[group.label] ?? false;

                    if (group.label === "Main") {
                        return (
                            <div key={group.label} className="mb-1">
                                {visibleItems.map((item) => (
                                    <NavLink
                                        key={item.href}
                                        item={item}
                                        active={isActive(item.href)}
                                        isCollapsed={isCollapsed}
                                    />
                                ))}
                            </div>
                        );
                    }

                    return (
                        <div key={group.label} className="mb-1">
                            {!isCollapsed && (
                                <button
                                    onClick={() => toggleGroup(group.label)}
                                    className="group flex w-full items-center justify-between px-2 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
                                >
                                    {group.label}
                                    <ChevronDown
                                        size={12}
                                        className={`transition-transform duration-200 ${isGroupCollapsed ? "-rotate-90" : ""}`}
                                    />
                                </button>
                            )}

                            {isCollapsed && (
                                <div className="mx-2 my-3 border-t border-[var(--pp-line)]" />
                            )}

                            {(!isGroupCollapsed || isCollapsed) && (
                                <div className="space-y-0.5">
                                    {visibleItems.map((item) => (
                                        <NavLink
                                            key={item.href}
                                            item={item}
                                            active={isActive(item.href)}
                                            isCollapsed={isCollapsed}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="border-t border-[var(--pp-line)] px-3 py-3">
                <button
                    onClick={toggleCollapse}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-[var(--pp-mint)] hover:text-foreground"
                >
                    {isCollapsed ? (
                        <PanelLeft size={18} />
                    ) : (
                        <>
                            <PanelLeftClose size={16} />
                            <span>Ciutkan</span>
                        </>
                    )}
                </button>
            </div>
        </TooltipProvider>
    );
}

function NavLink({ item, active, isCollapsed }: { item: NavItem; active: boolean; isCollapsed: boolean }) {
    const Icon = item.icon;

    const linkContent = (
        <Link
            href={item.href}
            target={item.external ? "_blank" : undefined}
            className={`
                group relative flex min-h-[42px] items-center rounded-md border text-sm font-semibold transition-colors
                ${isCollapsed ? "mx-1 justify-center px-2" : "gap-3 px-3"}
                ${active
                    ? "border-[var(--pp-ink)] bg-[var(--pp-highlight)] text-[var(--pp-ink)] shadow-[inset_0_0_0_1px_var(--pp-ink)]"
                    : "border-transparent text-muted-foreground hover:bg-[var(--pp-mint)] hover:text-foreground"
                }
            `}
        >
            <Icon
                size={isCollapsed ? 20 : 17}
                className={`flex-shrink-0 ${active ? "text-[var(--pp-ink)]" : "text-muted-foreground group-hover:text-foreground"}`}
            />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
        </Link>
    );

    if (isCollapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                    <p className="text-xs font-medium">{item.label}</p>
                </TooltipContent>
            </Tooltip>
        );
    }

    return linkContent;
}
