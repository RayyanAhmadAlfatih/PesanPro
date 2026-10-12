"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseAnnouncementLines } from "@/lib/announcement-policy";

export interface WhatsNewAnnouncement {
  id: string;
  title: string;
  body: string;
  version: string | null;
  href: string | null;
  publishedAt: string;
}

/**
 * Pages where an interrupting popup would land on top of a task already in
 * progress. The popup waits for the next navigation instead of covering a QR
 * scan or the announcement editor.
 */
const DEFERRED_PATHS = ["/dashboard/sessions", "/dashboard/announcements"];

function isDeferredPath(pathname: string): boolean {
  return DEFERRED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function dismissalKey(id: string): string {
  return `pesanpro:whats-new:${id}`;
}

export function WhatsNewModal({ announcement }: { announcement: WhatsNewAnnouncement | null }) {
  const pathname = usePathname();
  const router = useRouter();

  // The database watermark is the real record of what the user has seen. This
  // per-tab flag only prevents a repeat popup when that write never landed.
  const [dismissedId, setDismissedId] = useState<string | null>(() => {
    if (typeof window === "undefined" || !announcement) return null;
    return window.sessionStorage.getItem(dismissalKey(announcement.id)) ? announcement.id : null;
  });

  const dismiss = useCallback(() => {
    if (!announcement || dismissedId === announcement.id) return;
    setDismissedId(announcement.id);
    window.sessionStorage.setItem(dismissalKey(announcement.id), "1");
    void fetch("/api/announcements/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: announcement.id }),
    }).catch(() => undefined);
  }, [announcement, dismissedId]);

  if (!announcement) return null;

  const bullets = parseAnnouncementLines(announcement.body);
  const open = dismissedId !== announcement.id && !isDeferredPath(pathname);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-left text-lg leading-snug font-bold">
            {announcement.title}
          </DialogTitle>
          <DialogDescription className="text-left text-sm">
            {announcement.version
              ? `Yang baru di PesanPro, versi ${announcement.version}.`
              : "Yang baru di PesanPro."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm">
          {bullets.map((line, index) => (
            <li key={`${index}-${line}`} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--pp-ink)]" />
              <span className="min-w-0 break-words">{line}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          {announcement.href ? (
            <Button
              variant="outline"
              onClick={() => {
                const target = announcement.href;
                dismiss();
                if (target) router.push(target);
              }}
            >
              Lihat detail
            </Button>
          ) : null}
          <Button onClick={dismiss}>Mengerti</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
