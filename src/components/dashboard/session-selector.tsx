"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "./session-provider";

export function SessionSelector() {
  const { sessions, sessionId, setSessionId, loading, refreshSessions } = useSession();
  const selectedSession = sessions.find((session) => session.sessionId === sessionId);

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <span className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground lg:inline">Session</span>
      <div className="w-[150px] sm:w-[220px]">
        <Select value={sessionId} onValueChange={setSessionId} disabled={loading || sessions.length === 0}>
          <SelectTrigger className="h-11 rounded-md border border-[var(--pp-ink)] bg-white shadow-none focus:ring-[3px] focus:ring-[var(--pp-highlight)]">
            <SelectValue placeholder={loading ? "Memuat…" : "Pilih session"}>
              {selectedSession ? (
                <div className="flex min-w-0 items-center gap-2 text-left">
                  <span className={`size-2.5 shrink-0 rounded-full border border-[var(--pp-ink)] ${selectedSession.status === "CONNECTED" ? "bg-[var(--pp-mint)]" : "bg-[var(--pp-blush)]"}`} />
                  <span className="truncate text-xs font-semibold sm:text-sm">{selectedSession.name}</span>
                </div>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl border border-[var(--pp-ink)] bg-[var(--pp-paper)] p-1 shadow-[0_1px_3px_rgba(26,51,0,0.12)]">
            {sessions.map((session) => (
              <SelectItem key={session.sessionId} value={session.sessionId} className="cursor-pointer rounded-md py-2 focus:bg-[var(--pp-highlight)]">
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 shrink-0 rounded-full border border-[var(--pp-ink)] ${session.status === "CONNECTED" ? "bg-[var(--pp-mint)]" : "bg-[var(--pp-blush)]"}`} />
                  <div className="flex flex-col"><span className="text-sm font-semibold">{session.name}</span><span className="font-mono text-[10px] text-muted-foreground">{session.sessionId}</span></div>
                </div>
              </SelectItem>
            ))}
            {sessions.length === 0 && !loading && <div className="px-2 py-6 text-center text-xs text-muted-foreground">Belum ada session.</div>}
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="icon" onClick={refreshSessions} title="Segarkan session" disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
    </div>
  );
}
