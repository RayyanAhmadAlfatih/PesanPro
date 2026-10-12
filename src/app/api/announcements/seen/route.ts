import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { markAnnouncementSeen } from "@/lib/announcement-service";

const seenSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();

/**
 * Records that the signed-in user closed the popup. Session-only: a machine
 * caller with an API key has no browser popup to dismiss.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = seenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  await markAnnouncementSeen(session.user.id, parsed.data.id);
  return NextResponse.json({ status: true });
}
