import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { dispatchQueuedMessage } from "@/modules/whatsapp/message-adapter";

const bodySchema = z.object({ jobId: z.string().min(1), claimToken: z.string().min(1) }).strict();

function safeSecretEqual(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const expected = getEnv().MESSAGE_WORKER_SECRET;
  const provided = request.headers.get("x-message-worker-secret") ?? "";
  if (!expected || !safeSecretEqual(provided, expected)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED_WORKER", message: "Unauthorized" } }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Invalid dispatch request" } }, { status: 400 });
  }
  const job = await prisma.messageJob.findFirst({
    where: { id: parsed.data.jobId, status: "PROCESSING", lockedBy: parsed.data.claimToken },
    include: { session: true, media: true },
  });
  if (!job) return NextResponse.json({ error: { code: "CLAIM_NOT_FOUND", message: "Active job claim was not found" } }, { status: 409 });
  const data = await dispatchQueuedMessage({ ...job, claimToken: parsed.data.claimToken });
  return NextResponse.json({ data });
}
