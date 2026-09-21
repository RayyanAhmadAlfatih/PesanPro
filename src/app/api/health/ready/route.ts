import { NextResponse } from "next/server";
import { collectReadinessSnapshot } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await collectReadinessSnapshot();
    return NextResponse.json({ status: snapshot.ok ? "ok" : "not_ready", check: "readiness", ...snapshot }, {
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
