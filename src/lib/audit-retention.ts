import { prisma } from "./prisma";

export function auditRetentionBoundary(days: number, now = new Date()) {
  if (!Number.isInteger(days) || days < 30 || days > 3650) throw new Error("Audit retention must be between 30 and 3650 days");
  return new Date(now.getTime() - days * 86_400_000);
}

export async function purgeExpiredAuditLogs(days: number, now = new Date()) {
  const boundary = auditRetentionBoundary(days, now);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: boundary } } });
  return { deleted: result.count, boundary };
}
