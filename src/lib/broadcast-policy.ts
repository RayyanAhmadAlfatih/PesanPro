import crypto from "node:crypto";
import { MessageJobError } from "./message-job-errors";
import { normalizeRecipient } from "./message-recipient";

export type RecipientVariables = Record<string, string>;
export type RecipientSnapshot = { jid: string; position: number; status: "PENDING" | "SKIPPED"; variables?: RecipientVariables; safeErrorCode?: string; safeErrorMessage?: string };
export type RecipientDataInput = { recipient: string; variables?: RecipientVariables };

export function prepareRecipientDataSnapshots(values: readonly RecipientDataInput[]) {
  if (values.length > 5000) throw new MessageJobError("TOO_MANY_RECIPIENTS", "A broadcast cannot exceed 5000 recipients", 422, false);
  const seen = new Set<string>();
  const snapshots: RecipientSnapshot[] = [];
  for (const value of values) {
    const jid = normalizeRecipient(value.recipient);
    if (seen.has(jid)) continue;
    seen.add(jid);
    const isGroup = jid.endsWith("@g.us");
    snapshots.push(isGroup
      ? { jid, position: snapshots.length, status: "SKIPPED", variables: value.variables, safeErrorCode: "GROUP_RECIPIENT_EXCLUDED", safeErrorMessage: "Groups are excluded from broadcasts" }
      : { jid, position: snapshots.length, status: "PENDING", variables: value.variables });
  }
  if (snapshots.length === 0) throw new MessageJobError("NO_RECIPIENTS", "No valid unique recipients remain", 422, false);
  return snapshots;
}

export function prepareRecipientSnapshots(values: readonly string[]) {
  return prepareRecipientDataSnapshots(values.map((recipient) => ({ recipient })));
}

export function deterministicBroadcastDelay(seed: string, position: number, minMs: number, maxMs: number) {
  if (!Number.isInteger(minMs) || !Number.isInteger(maxMs) || minMs < 0 || maxMs < minMs) {
    throw new Error("Invalid broadcast delay range");
  }
  if (minMs === maxMs) return minMs;
  const digest = crypto.createHash("sha256").update(`${seed}:delay:${position}`).digest();
  return minMs + (digest.readUInt32BE(0) % (maxMs - minMs + 1));
}

export function nextBroadcastStatus(pending: number) {
  return pending === 0 ? "COMPLETED" as const : "RUNNING" as const;
}
