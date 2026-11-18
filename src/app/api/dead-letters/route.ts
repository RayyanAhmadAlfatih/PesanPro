import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { listTenantDeadLetters } from "@/lib/dead-letter-service";
import { MessageJobError } from "@/lib/message-job-errors";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request as Parameters<typeof getAuthenticatedUser>[0]);
  if (!user || user.authMethod !== "session") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await listTenantDeadLetters({ id: user.id, role: user.role, ownerId: user.ownerId, email: user.email });
    return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
