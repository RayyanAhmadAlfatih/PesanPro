import type { Role, SuppressionReason } from "@prisma/client";
import { resolveTenantId } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { normalizeRecipient } from "./message-recipient";
import { prisma } from "./prisma";

export type SuppressionActor = { id: string; role: Role; ownerId?: string | null };

export function isUnsubscribeText(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[.!?]+$/g, "").trim();
  return new Set(["STOP", "UNSUBSCRIBE", "BERHENTI", "BATAL LANGGANAN"]).has(normalized);
}

export async function addSuppression(actor: SuppressionActor, recipient: string, reason: SuppressionReason = "MANUAL") {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Tenant was not found", 404, false);
  const jid = normalizeRecipient(recipient);
  return prisma.suppressionEntry.upsert({
    where: { tenantId_jid: { tenantId, jid } },
    create: { tenantId, jid, reason, createdById: actor.id },
    update: { reason, createdById: actor.id, removedAt: null },
  });
}

export async function removeSuppression(actor: SuppressionActor, recipient: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("SUPPRESSION_NOT_FOUND", "Suppression entry was not found", 404, false);
  const jid = normalizeRecipient(recipient);
  const result = await prisma.suppressionEntry.updateMany({ where: { tenantId, jid, removedAt: null }, data: { removedAt: new Date() } });
  if (result.count === 0) throw new MessageJobError("SUPPRESSION_NOT_FOUND", "Suppression entry was not found", 404, false);
  return { jid, removed: true };
}

export async function listSuppressions(actor: SuppressionActor, limit = 100) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) return [];
  return prisma.suppressionEntry.findMany({
    where: { tenantId, removedAt: null },
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(1, Number.isInteger(limit) ? limit : 100)),
  });
}

export async function suppressFromInbound(sessionDbId: string, recipient: string, sourceMessageId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionDbId }, select: { userId: true } });
  if (!session) return false;
  const jid = normalizeRecipient(recipient);
  await prisma.$transaction([
    prisma.suppressionEntry.upsert({
      where: { tenantId_jid: { tenantId: session.userId, jid } },
      create: { tenantId: session.userId, jid, reason: "UNSUBSCRIBE", sourceMessageId },
      update: { reason: "UNSUBSCRIBE", sourceMessageId, removedAt: null },
    }),
    prisma.contact.updateMany({
      where: { jid, session: { userId: session.userId } },
      data: { consentStatus: "OPTED_OUT", consentAt: new Date(), consentSource: "INBOUND_STOP" },
    }),
  ]);
  return true;
}

export async function isRecipientSuppressed(tenantId: string, jid: string) {
  return Boolean(await prisma.suppressionEntry.findFirst({ where: { tenantId, jid, removedAt: null }, select: { id: true } }));
}
