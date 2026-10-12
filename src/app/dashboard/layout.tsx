import { auth } from "@/lib/auth";
import { Navbar } from "@/components/dashboard/navbar";
import { SessionProvider } from "@/components/dashboard/session-provider";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import { WhatsNewModal } from "@/components/dashboard/whats-new-modal";
import { getActiveAnnouncementForUser, type ActiveAnnouncement } from "@/lib/announcement-service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Toaster } from "sonner";
import pkg from "../../../package.json";


export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
    const appName = systemConfig?.appName || "PesanPro";

    // A popup is never worth failing the whole dashboard over, so this one
    // lookup degrades to "no announcement" instead of throwing.
    let announcement: ActiveAnnouncement | null = null;
    if (session?.user?.id && session.user.accountActive !== false) {
        try {
            announcement = await getActiveAnnouncementForUser(session.user.id);
        } catch (error) {
            logger.error("Announcement", "Failed to load the active announcement:", error);
        }
    }

    return (
        <SessionProvider>
            <SidebarProvider>
                <div className="pp-dashboard flex h-screen overflow-hidden bg-background" suppressHydrationWarning={true}>
                    <SidebarShell
                        appName={appName}
                        userName={session?.user?.name}
                        userEmail={session?.user?.email}
                        version={pkg.version}
                    />
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden" suppressHydrationWarning={true}>
                        <Navbar appName={appName} />
                        <main className="styled-scrollbar flex-1 overflow-auto">
                            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
                                {children}
                            </div>
                        </main>
                    </div>
                    <WhatsNewModal announcement={announcement} />
                    <Toaster toastOptions={{ className: "!border !border-[var(--pp-ink)] !bg-[var(--pp-highlight)] !text-[var(--pp-ink)] !shadow-[2px_2px_0_var(--pp-ink)]" }} />
                </div>
            </SidebarProvider>
        </SessionProvider>
    );
}
