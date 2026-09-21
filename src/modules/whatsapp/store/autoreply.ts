import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_AUTOREPLY_INPUT_LENGTH } from "@/lib/autoreply-policy";

export type AutoReplyInboundEvent = {
  sessionDbId: string;
  sourceMessageId: string;
  text: string;
  recipientJid: string;
  senderJid: string;
  isGroup: boolean;
  fromMe: boolean;
};

export async function ingestAutoReplyMessage(event: AutoReplyInboundEvent) {
  const text = event.text.trim().slice(0, MAX_AUTOREPLY_INPUT_LENGTH);
  if (event.fromMe || !text || !event.sourceMessageId || !event.recipientJid || !event.senderJid) {
    return { accepted: false, idempotent: false, triggerId: null };
  }
  const session = await prisma.session.findUnique({ where: { id: event.sessionDbId }, select: { id: true, userId: true } });
  if (!session) return { accepted: false, idempotent: false, triggerId: null };
  const eventKey = crypto.createHash("sha256")
    .update(`${session.id}\u0000${event.recipientJid}\u0000${event.sourceMessageId}`)
    .digest("hex");
  try {
    const trigger = await prisma.autoReplyTriggerLog.create({
      data: {
        tenantId: session.userId,
        sessionId: session.id,
        eventKey,
        sourceMessageId: event.sourceMessageId,
        sourceText: text,
        recipientJid: event.recipientJid,
        senderJid: event.senderJid,
        isGroup: event.isGroup,
      },
      select: { id: true },
    });
    return { accepted: true, idempotent: false, triggerId: trigger.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.autoReplyTriggerLog.findUnique({
        where: { sessionId_eventKey: { sessionId: session.id, eventKey } },
        select: { id: true },
      });
      return { accepted: Boolean(existing), idempotent: true, triggerId: existing?.id ?? null };
    }
    throw error;
  }
}
