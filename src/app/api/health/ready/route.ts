import { NextResponse } from "next/server";
import { collectReadinessSnapshot } from "@/lib/operations";

export const dynamic = "force-dynamic";

type ReadinessSnapshot = Awaited<ReturnType<typeof collectReadinessSnapshot>>;

/**
 * Public readiness probe.
 *
 * The raw snapshot carries operator-only detail (absolute private-media path,
 * disk capacity, and per-worker heartbeat timestamps). None of that is needed
 * to answer "is the service ready?", so it is stripped here to avoid disclosing
 * the server layout to anonymous callers. Full detail stays available through
 * the authenticated admin system monitor.
 */
function publicReadiness(snapshot: ReadinessSnapshot) {
  const checks = snapshot?.checks;
  const web = checks?.web;
  const database = checks?.database;
  const storage = checks?.storage;
  const processes = checks?.processes ?? [];
  return {
    status: snapshot?.ok ? "ok" : "not_ready",
    check: "readiness",
    ok: Boolean(snapshot?.ok),
    timestamp: snapshot?.timestamp ?? null,
    checks: {
      web: { ok: web?.ok ?? true },
      database: { ok: database?.ok ?? false, latencyMs: database?.latencyMs ?? null },
      storage: { ok: storage?.ok ?? false, latencyMs: storage?.latencyMs ?? null },
      processes: processes.map((process) => ({ processType: process.processType, ok: process.ok })),
    },
  };
}

export async function GET() {
  try {
    const snapshot = await collectReadinessSnapshot();
    return NextResponse.json(publicReadiness(snapshot), {
      status: snapshot.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ status: "not_ready", check: "readiness", ok: false, errorCode: "READINESS_CHECK_FAILED" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
