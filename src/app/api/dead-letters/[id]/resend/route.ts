import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { resendTenantDeadLetter } from "@/lib/dead-letter-service";
import { MessageJobError } from "@/lib/message-job-errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request as Parameters<typeof getAuthenticatedUser>[0]);
  if (!user || user.authMethod !== "session") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const result = await resendTenantDeadLetter({ id: user.id, role: user.role, ownerId: user.ownerId, email: user.email }, id);
    return NextResponse.json(result, { status: result.idempotent ? 200 : 202 });
  } catch (error) {
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
