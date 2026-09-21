import type { BroadcastRecipientStatus, MessageJobStatus } from "@prisma/client";

export type CampaignProgressRow = {
  status: BroadcastRecipientStatus;
  safeErrorCode?: string | null;
  messageJob?: { status: MessageJobStatus } | null;
};

export function calculateCampaignProgress(rows: readonly CampaignProgressRow[]) {
  const result = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, unsubscribed: 0, cancelled: 0 };
  for (const row of rows) {
    const status = row.messageJob?.status ?? row.status;
    if (["PENDING", "CLAIMED", "ENQUEUED", "QUEUED", "PROCESSING"].includes(status)) result.queued += 1;
    else if (status === "SENT") result.sent += 1;
    else if (status === "DELIVERED") result.delivered += 1;
    else if (status === "READ") result.read += 1;
    else if (status === "FAILED") result.failed += 1;
    else if (status === "SKIPPED") result.skipped += 1;
    else if (status === "CANCELLED") result.cancelled += 1;
    if (row.safeErrorCode === "RECIPIENT_UNSUBSCRIBED") result.unsubscribed += 1;
  }
  return result;
}

export function selectCampaignDevice(input: {
  primary: { id: string; sessionId: string; status: string };
  fallback?: { id: string; sessionId: string; status: string } | null;
  fallbackPolicy: "PRIMARY_ONLY" | "USE_FALLBACK";
}) {
  if (input.primary.status === "CONNECTED") return input.primary;
  if (input.fallbackPolicy === "USE_FALLBACK" && input.fallback?.status === "CONNECTED") return input.fallback;
  return null;
}
