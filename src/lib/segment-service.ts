import { Prisma, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { resolveTenantId } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";
import { segmentDefinitionSchema, type SegmentDefinitionInput } from "./segment-input";
import { assertSegmentComplexity, matchesSegmentAttributes, MAX_SEGMENT_CANDIDATES, uniqueIds } from "./segment-policy";

export type SegmentActor = { id: string; role: Role; ownerId?: string | null };

async function actorTenant(actor: SegmentActor) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  return tenantId;
}

async function resolveSession(actor: SegmentActor, publicId: string) {
  if (!await canAccessSession(actor.id, actor.role, publicId)) {
    throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  }
  const session = await prisma.session.findUnique({
    where: { sessionId: publicId },
    select: { id: true, sessionId: true, userId: true },
  });
  if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  const tenantId = await actorTenant(actor);
  if (actor.role !== "SUPERADMIN" && session.userId !== tenantId) {
    throw new MessageJobError("TENANT_MISMATCH", "Device does not belong to this tenant", 403, false);
  }
  return { ...session, tenantId: session.userId };
}

async function assertTenantTagReferences(tenantId: string, definition: SegmentDefinitionInput) {
  const tagIds = uniqueIds(definition.tagIds);
  const tagCount = tagIds.length ? await prisma.contactTag.count({ where: { id: { in: tagIds }, tenantId } }) : 0;
  if (tagCount !== tagIds.length) throw new MessageJobError("INVALID_SEGMENT_TAG", "One or more tags do not belong to this tenant", 422, false);
}

async function assertReferences(tenantId: string, sessionPublicId: string, definition: SegmentDefinitionInput) {
  await assertTenantTagReferences(tenantId, definition);
  const labelIds = uniqueIds(definition.labelIds);
  const labelCount = labelIds.length ? await prisma.label.count({ where: { id: { in: labelIds }, sessionId: sessionPublicId } }) : 0;
  if (labelCount !== labelIds.length) throw new MessageJobError("INVALID_SEGMENT_LABEL", "One or more labels do not belong to this device", 422, false);
}

export async function evaluateSegmentDefinition(
  actor: SegmentActor,
  sessionPublicId: string,
  rawDefinition: SegmentDefinitionInput,
  sampleLimit = 10,
) {
  const definition = segmentDefinitionSchema.parse(rawDefinition);
  const complexity = assertSegmentComplexity(definition);
  const session = await resolveSession(actor, sessionPublicId);
  await assertReferences(session.tenantId, session.sessionId, definition);

  const where: Prisma.ContactWhereInput = {
    sessionId: session.id,
    ...(definition.consentStatuses.length ? { consentStatus: { in: definition.consentStatuses } } : {}),
    ...(definition.sources.length ? { source: { in: definition.sources } } : {}),
    ...(definition.lastActivityFrom || definition.lastActivityTo ? {
      lastActivityAt: {
        ...(definition.lastActivityFrom ? { gte: new Date(definition.lastActivityFrom) } : {}),
        ...(definition.lastActivityTo ? { lte: new Date(definition.lastActivityTo) } : {}),
      },
    } : {}),
    ...(definition.tagIds.length ? {
      AND: uniqueIds(definition.tagIds).map((tagId) => ({ tagAssignments: { some: { tagId } } })),
    } : {}),
  };
  const candidates = await prisma.contact.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_SEGMENT_CANDIDATES + 1,
    select: {
      id: true,
      jid: true,
      name: true,
      notify: true,
      consentStatus: true,
      source: true,
      lastActivityAt: true,
      customAttributes: true,
    },
  });
  if (candidates.length > MAX_SEGMENT_CANDIDATES) {
    throw new MessageJobError("SEGMENT_TOO_BROAD", `Segment exceeds ${MAX_SEGMENT_CANDIDATES} candidate contacts`, 422, false);
  }

  let labelJids: Set<string> | null = null;
  if (definition.labelIds.length) {
    const perLabel = await Promise.all(uniqueIds(definition.labelIds).map((labelId) => prisma.chatLabel.findMany({
      where: { labelId },
      select: { chatJid: true },
    })));
    labelJids = perLabel.reduce<Set<string> | null>((intersection, rows) => {
      const current = new Set(rows.map((row) => row.chatJid));
      return intersection === null ? current : new Set([...intersection].filter((jid) => current.has(jid)));
    }, null);
  }

  const matches = candidates.filter((contact) => {
    if (labelJids && !labelJids.has(contact.jid)) return false;
    return matchesSegmentAttributes(contact.customAttributes, definition.attributes);
  });
  return {
    session,
    definition,
    complexity,
    count: matches.length,
    contacts: matches,
    sample: matches.slice(0, Math.max(0, Math.min(25, sampleLimit))),
  };
}

export async function listSegments(actor: SegmentActor) {
  const tenantId = await actorTenant(actor);
  return prisma.segment.findMany({ where: { tenantId, isActive: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
}

export async function getSegment(actor: SegmentActor, id: string) {
  const tenantId = await actorTenant(actor);
  const segment = await prisma.segment.findFirst({ where: { id, tenantId, isActive: true } });
  if (!segment) throw new MessageJobError("SEGMENT_NOT_FOUND", "Segment was not found", 404, false);
  return segment;
}

export async function createSegment(actor: SegmentActor, input: { name: string; description?: string; definition: SegmentDefinitionInput }) {
  const tenantId = await actorTenant(actor);
  const definition = segmentDefinitionSchema.parse(input.definition);
  assertSegmentComplexity(definition);
  await assertTenantTagReferences(tenantId, definition);
  return prisma.segment.create({
    data: { tenantId, createdById: actor.id, name: input.name, description: input.description, definition: definition as Prisma.InputJsonValue },
  });
}

export async function updateSegment(actor: SegmentActor, id: string, input: { name: string; description?: string; definition: SegmentDefinitionInput }) {
  const tenantId = await actorTenant(actor);
  const definition = segmentDefinitionSchema.parse(input.definition);
  assertSegmentComplexity(definition);
  await assertTenantTagReferences(tenantId, definition);
  const changed = await prisma.segment.updateMany({
    where: { id, tenantId, isActive: true },
    data: { name: input.name, description: input.description, definition: definition as Prisma.InputJsonValue, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new MessageJobError("SEGMENT_NOT_FOUND", "Segment was not found", 404, false);
  return getSegment(actor, id);
}

export async function deleteSegment(actor: SegmentActor, id: string) {
  const tenantId = await actorTenant(actor);
  const changed = await prisma.segment.updateMany({ where: { id, tenantId, isActive: true }, data: { isActive: false } });
  if (changed.count !== 1) throw new MessageJobError("SEGMENT_NOT_FOUND", "Segment was not found", 404, false);
  return { id, deleted: true };
}

export async function listContactTags(actor: SegmentActor) {
  const tenantId = await actorTenant(actor);
  return prisma.contactTag.findMany({ where: { tenantId }, orderBy: [{ name: "asc" }, { id: "asc" }], include: { _count: { select: { assignments: true } } } });
}

export async function createContactTag(actor: SegmentActor, input: { name: string; color: string }) {
  const tenantId = await actorTenant(actor);
  return prisma.contactTag.create({ data: { tenantId, createdById: actor.id, name: input.name, color: input.color } });
}

export async function deleteContactTag(actor: SegmentActor, id: string) {
  const tenantId = await actorTenant(actor);
  const changed = await prisma.contactTag.deleteMany({ where: { id, tenantId } });
  if (changed.count !== 1) throw new MessageJobError("CONTACT_TAG_NOT_FOUND", "Contact tag was not found", 404, false);
  return { id, deleted: true };
}

export async function updateContactProfile(actor: SegmentActor, contactId: string, input: {
  source?: string;
  consentStatus?: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
  consentSource?: string;
  customAttributes?: Record<string, string | number | boolean | null>;
  tagIds?: string[];
}) {
  const tenantId = await actorTenant(actor);
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { session: { select: { sessionId: true, userId: true } } } });
  if (!contact || !await canAccessSession(actor.id, actor.role, contact.session.sessionId) || (actor.role !== "SUPERADMIN" && contact.session.userId !== tenantId)) {
    throw new MessageJobError("CONTACT_NOT_FOUND", "Contact was not found", 404, false);
  }
  const tagIds = uniqueIds(input.tagIds ?? []);
  if (input.tagIds) {
    const count = await prisma.contactTag.count({ where: { id: { in: tagIds }, tenantId: contact.session.userId } });
    if (count !== tagIds.length) throw new MessageJobError("INVALID_CONTACT_TAG", "One or more tags do not belong to this tenant", 422, false);
  }
  return prisma.$transaction(async (tx) => {
    if (input.tagIds) {
      await tx.contactTagAssignment.deleteMany({ where: { contactId } });
      if (tagIds.length) await tx.contactTagAssignment.createMany({ data: tagIds.map((tagId) => ({ contactId, tagId })) });
    }
    return tx.contact.update({
      where: { id: contactId },
      data: {
        source: input.source,
        consentStatus: input.consentStatus,
        consentAt: input.consentStatus ? new Date() : undefined,
        consentSource: input.consentSource,
        customAttributes: input.customAttributes as Prisma.InputJsonValue | undefined,
      },
      include: { tagAssignments: { include: { tag: true } } },
    });
  });
}
