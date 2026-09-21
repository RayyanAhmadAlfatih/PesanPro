"use client";

import { useState, useEffect } from "react";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SessionSelector } from "@/components/dashboard/session-selector";
import { Button } from "@/components/ui/button";
import { RealtimeClock } from "@/components/dashboard/realtime-clock";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Inbox, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { io } from "socket.io-client";

interface NavbarProps {
    appName?: string;
}

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    href?: string;
    createdAt: string;
}

export function Navbar({ appName }: NavbarProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const responseData = await res.json();
                const items = responseData?.data || [];
                setNotifications(items);
                setUnreadCount(items.filter((n: Notification) => !n.read).length);
            }
        } catch (e) {
            console.error("Failed to fetch notifications");
        }
    };

    useEffect(() => {
        // Initial fetch
        const fetchTimer = window.setTimeout(() => {
            void fetchNotifications();
        }, 0);

        // Setup Socket.IO connection
        if (session?.user?.id) {
            const socketInstance = io({
                path: "/api/socket/io",
            });

            socketInstance.on("connect", () => {
                console.log("Socket connected for notifications");
                // Join user-specific room
                socketInstance.emit("join-user-room", session.user.id);
            });

            socketInstance.on("notification:new", (notification: Notification) => {
                console.log("New notification received:", notification);

                // Add to notifications list
                setNotifications(prev => [notification, ...prev]);
                setUnreadCount(prev => prev + 1);

                // Show toast popup
                toast.info(notification.title, {
                    description: notification.message,
                    action: notification.href ? {
                        label: "View",
                        onClick: () => router.push(notification.href!)
                    } : undefined,
                });
            });

            return () => {
                window.clearTimeout(fetchTimer);
                socketInstance.disconnect();
            };
        }
        return () => window.clearTimeout(fetchTimer);
    }, [session?.user?.id]);

    const markAsRead = async (id?: string) => {
        try {
            const ids = id ? [id] : []; // Empty array means mark all
            const res = await fetch("/api/notifications/read", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids })
            });
            if (res.ok) {
                if (id) {
                    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
                    setUnreadCount(prev => Math.max(0, prev - 1));
                } else {
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                    setUnreadCount(0);
                }
            }
        } catch (e) {
            console.error("Failed to mark read");
        }
    };

    const deleteNotification = async (id: string) => {
        try {
            const res = await fetch(`/api/notifications/delete?id=${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setNotifications(prev => prev.filter(n => n.id !== id));
                setUnreadCount(prev => {
                    const notification = notifications.find(n => n.id === id);
                    return notification && !notification.read ? Math.max(0, prev - 1) : prev;
                });
                toast.success("Notification deleted");
            }
        } catch (e) {
            console.error("Failed to delete notification");
            toast.error("Failed to delete notification");
        }
    };

    const handleNotificationClick = (n: Notification) => {
        if (!n.read) markAsRead(n.id);
        if (n.href) router.push(n.href);
        setIsOpen(false);
    };

    return (
        <header className="sticky top-0 z-30 flex h-[72px] w-full items-center justify-between border-b border-[var(--pp-line)] bg-[var(--pp-paper)] px-4 sm:px-6">
            <div className="flex items-center gap-3">
                <MobileNav appName={appName} />
            </div>

            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <span className="hidden sm:inline"><RealtimeClock /></span>
                <SessionSelector />
                <div className="hidden h-7 w-px bg-[var(--pp-line)] sm:block" />

                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className={`h-5 w-5 transition-colors ${unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`} />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border border-[var(--pp-ink)] bg-[var(--pp-terracotta)] px-1 text-[10px] font-bold leading-[18px] text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-paper)] p-0 shadow-[0_1px_3px_rgba(26,51,0,0.12)]" align="end">
                        <div className="flex items-center justify-between border-b border-[var(--pp-line)] bg-[var(--pp-paper)] p-4">
                            <div>
                                <h4 className="font-semibold leading-none text-foreground">Notifikasi</h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {unreadCount > 0 ? `Ada ${unreadCount} notifikasi belum dibaca.` : "Tidak ada notifikasi baru."}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-xs" onClick={() => { router.push("/dashboard/inbox"); setIsOpen(false); }}>
                                    See all
                                </Button>
                                {unreadCount > 0 && (
                                    <Button variant="ghost" size="sm" onClick={() => markAsRead()} className="h-auto py-1 px-2 text-xs">
                                        Mark all read
                                    </Button>
                                )}
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="min-h-[150px] flex flex-col items-center justify-center text-center p-4">
                                    <div className="mb-3 rounded-md border border-[var(--pp-line)] bg-[var(--pp-white)] p-3">
                                        <Inbox className="h-6 w-6 text-slate-400" />
                                    </div>
                                    <p className="text-sm font-medium">Tidak ada notifikasi baru</p>
                                    <p className="text-xs text-muted-foreground max-w-[180px]">Informasi penting akan muncul di sini.</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {notifications.map(n => (
                                        <div
                                            key={n.id}
                                            className={`p-4 transition-colors hover:bg-[color-mix(in_srgb,var(--pp-highlight)_18%,transparent)] ${!n.read ? 'bg-[var(--pp-teal)]/35' : ''}`}
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div
                                                    className="flex-1 space-y-1 cursor-pointer"
                                                    onClick={() => handleNotificationClick(n)}
                                                >
                                                    <p className={`text-sm font-medium leading-none ${!n.read ? 'text-foreground' : 'text-foreground'}`}>
                                                        {n.title}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground whitespace-normal break-words">
                                                        {n.message}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!n.read && <span className="size-2 shrink-0 rounded-full bg-[var(--pp-terracotta)]" />}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteNotification(n.id);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-[var(--pp-danger)]" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </header>
    );
}
