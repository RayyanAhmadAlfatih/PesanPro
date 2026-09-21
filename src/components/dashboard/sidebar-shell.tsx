"use client";

import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

interface SidebarShellProps {
  appName: string;
  userName?: string | null;
  userEmail?: string | null;
  version: string;
}

export function SidebarShell({ appName, userName, userEmail, version }: SidebarShellProps) {
  const { isCollapsed } = useSidebar();
  const initials = appName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "PP";

  return (
    <aside className={`hidden h-full shrink-0 flex-col border-r border-[var(--pp-line)] bg-[var(--pp-paper)] md:flex ${isCollapsed ? "w-[72px]" : "w-[268px]"}`}>
      <div className={`border-b border-[var(--pp-line)] ${isCollapsed ? "px-3 py-4" : "px-5 py-4"}`}>
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--pp-ink)] bg-[var(--pp-highlight)] font-[family-name:var(--font-display)] text-sm font-extrabold text-[var(--pp-ink)]">
            {initials}
          </div>
          {!isCollapsed && <div className="min-w-0"><p className="truncate font-[family-name:var(--font-display)] text-xl font-extrabold leading-none tracking-[-0.03em]">{appName}</p><p className="mt-1 text-xs text-muted-foreground">WhatsApp operations</p></div>}
        </div>
      </div>

      <SidebarNav />

      <div className={`border-t border-[var(--pp-line)] bg-[var(--pp-paper)] ${isCollapsed ? "p-2" : "p-4"}`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-md border border-[var(--pp-ink)] bg-[var(--pp-mint)] text-xs font-bold">{userName?.charAt(0)?.toUpperCase() || "U"}</div>
            <Button variant="ghost" size="icon-sm" aria-label="Keluar" onClick={() => signOut({ callbackUrl: "/auth/login" })}><LogOut /></Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--pp-ink)] bg-[var(--pp-mint)] text-sm font-bold">{userName?.charAt(0)?.toUpperCase() || "U"}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{userName || "User"}</p><p className="truncate text-xs text-muted-foreground">{userEmail}</p></div>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => signOut({ callbackUrl: "/auth/login" })}><LogOut /> Keluar</Button>
            <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">v{version}</p>
          </>
        )}
      </div>
    </aside>
  );
}
