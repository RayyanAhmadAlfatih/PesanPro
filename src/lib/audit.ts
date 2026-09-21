import { prisma } from "./prisma";
import { logger, redactLogValue } from "./logger";

export type AuditAction =
  | "user.register"
  | "user.login"
  | "user.login_failed"
  | "session.create"
  | "session.start"
  | "session.stop"
  | "session.restart"
  | "session.logout"
  | "session.delete"
  | "session.pair"
  | "session.access_grant"
  | "session.access_revoke"
  | "api_key.generate"
  | "api_key.revoke"
  | "webhook.create"
  | "webhook.update"
  | "webhook.delete"
  | "webhook.test"
  | "message.send"
  | "message.broadcast";

export async function recordAudit(params: {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction | string;
  resource: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        meta: (redactLogValue(params.meta) as never) ?? undefined,
      },
    });
  } catch (e) {
    // Audit must never break the main flow
    logger.error("Audit", "Failed to record audit log:", e);
  }
}
