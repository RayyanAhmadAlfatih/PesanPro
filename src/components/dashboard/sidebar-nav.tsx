"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react";
import {
    LayoutDashboard,
    MessageSquare,
    Users,
    Settings,
    QrCode,
    Webhook,
    CalendarClock,
    Bell,
    Send,
    Megaphone,
    HardDrive,
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
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/dashboard/sessions", label: "Sessions / QR", icon: QrCode },
        ],
    },
    {
        label: "Messaging",
        items: [
            { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
            { href: "/dashboard/message-queue", label: "Message Queue", icon: ListRestart },
            { href: "/dashboard/broadcast", label: "Broadcast", icon: Megaphone },
            { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
            { href: "/dashboard/media", label: "Media Manager", icon: HardDrive },
        ],
    },
    {
        label: "Data",
        items: [
            { href: "/dashboard/labels", label: "Labels", icon: Tag },
        ],
    },
    {
        label: "Automation",
        items: [
            { href: "/dashboard/autoreply", label: "Auto Reply", icon: MessageCircleReply },
            { href: "/dashboard/scheduler", label: "Scheduler", icon: CalendarClock },
        ],
    },
    {
        label: "Developer",
        items: [
            { href: "/dashboard/developer", label: "Developer", icon: Code2 },
            { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
            { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
        ],
    },
    {
        label: "Administration",
        items: [
            { href: "/dashboard/users", label: "Users", icon: Users },
            { href: "/dashboard/commercial", label: "Commercial", icon: BadgeDollarSign },
            { href: "/dashboard/settings", label: "Settings", icon: Settings },
            { href: "/dashboard/system-monitor", label: "System Monitor", icon: Activity },
            { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
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
