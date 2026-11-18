"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DeadLetterItem = {
  id: string;
  recipient: string;
  text: string;
  failedAt: string;
  safeErrorCode: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { tanggal: "-", jam: "-" };
  return { tanggal: dateFormatter.format(date), jam: timeFormatter.format(date) };
}

export function DeadLetterModal() {
  const pathname = usePathname();
  const [items, setItems] = useState<DeadLetterItem[]>([]);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/dead-letters", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("fetch failed"))))
      .then((payload: { data?: DeadLetterItem[] }) => {
        if (active && Array.isArray(payload.data)) setItems(payload.data);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const decide = useCallback(async (item: DeadLetterItem, action: "resend" | "dismiss") => {
    if (busyId) return;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/dead-letters/${encodeURIComponent(item.id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Gagal memproses pesan");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (action === "resend") toast("Oke, pesannya masuk antrean lagi.");
      else toast("Siap, pesannya nggak dikirim.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Gagal memproses pesan");
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  const deferred = pathname === "/dashboard/sessions" || pathname.startsWith("/dashboard/sessions/");
  const open = ready && !hidden && !deferred && items.length > 0;
  if (!open) return null;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) setHidden(true); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-left text-lg leading-snug font-bold">Ada pesan yang nyangkut</DialogTitle>
          <DialogDescription className="text-left text-sm">
            Beberapa pesan gagal kekirim. Putuskan satu per satu di bawah.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[45vh] space-y-3 overflow-y-auto">
          {items.map((item) => {
            const when = formatWhen(item.failedAt);
            return (
              <li key={item.id} className="rounded-md border border-[var(--pp-ink)] p-3">
                <p className="text-sm font-semibold break-words">
                  Pesan ke {item.recipient} tanggal {when.tanggal}, jam {when.jam} gagal kekirim.
                </p>
                {item.text ? (
                  <p className="mt-1 text-xs text-[var(--pp-muted)] break-words">{item.text}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busyId !== null} onClick={() => decide(item, "resend")}>
                    Kirim ulang
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => decide(item, "dismiss")}>
                    Biarin aja
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setHidden(true)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
