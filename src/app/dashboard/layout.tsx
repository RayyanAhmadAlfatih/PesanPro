import { auth } from "@/lib/auth";
import { Navbar } from "@/components/dashboard/navbar";
import { SessionProvider } from "@/components/dashboard/session-provider";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import { prisma } from "@/lib/prisma";
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
                    <Toaster toastOptions={{ className: "!border !border-[var(--pp-ink)] !bg-[var(--pp-highlight)] !text-[var(--pp-ink)] !shadow-[2px_2px_0_var(--pp-ink)]" }} />
                </div>
            </SidebarProvider>
        </SessionProvider>
    );
}
