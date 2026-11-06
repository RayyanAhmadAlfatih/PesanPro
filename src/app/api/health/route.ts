import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public liveness probe for uptime checkers and load balancers that poll the
 * conventional `/api/health` path. It answers without a session and returns an
 * alive status only: no readiness/DB state, no tenant or session data, no
 * storage paths, worker topology, versions, or timestamps.
 * `/api/health/ready` stays the readiness probe; `/api/health/live` stays the
 * extended (non-sensitive) liveness probe.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", check: "liveness" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
