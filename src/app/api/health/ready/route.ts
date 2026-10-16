import { NextResponse } from "next/server";
import { collectReadinessSnapshot } from "@/lib/operations";

export const dynamic = "force-dynamic";

/**
 * Public readiness probe.
 *
 * This route is intentionally reachable without authentication (load balancer /
 * uptime checks), so the response only reports whether the service is ready.
 * The detailed snapshot (storage paths, disk capacity, worker topology, queue
 * depths) is exposed only through the session-gated `/api/health` route.
 */
export async function GET() {
  try {
    const snapshot = await collectReadinessSnapshot();
    return NextResponse.json({
      status: snapshot.ok ? "ok" : "not_ready",
      check: "readiness",
      ok: snapshot.ok,
      timestamp: snapshot.timestamp,
    }, {
      status: snapshot.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ status: "not_ready", check: "readiness", errorCode: "READINESS_CHECK_FAILED" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
