import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AnyMessageContent, WAMessage } from "@whiskeysockets/baileys";
import type { ClaimedMessageJob } from "@/lib/message-queue";
import { MessageJobError } from "@/lib/message-job-errors";
import { resolvePrivateMediaPath } from "@/lib/private-media";
import { checkPersistentRateLimit } from "@/lib/rate-limit";
import { onMessageSent } from "@/lib/webhook";
import { buildQuotedMessage } from "@/lib/whatsapp-message";
import { waManager } from "./manager";

async function buildMessageContent(job: ClaimedMessageJob): Promise<AnyMessageContent> {
  if (job.type === "TEXT") {
    const requestPayload = typeof job.requestPayload === "object" && job.requestPayload !== null && !Array.isArray(job.requestPayload)
      ? job.requestPayload
      : {};
    const mentions = Array.isArray(requestPayload.mentions)
      ? requestPayload.mentions.filter((value): value is string => typeof value === "string")
      : [];
    return { text: job.text ?? "", ...(mentions.length > 0 ? { mentions } : {}) };
  }
  if (!job.media || job.media.status !== "ACTIVE") {
    throw new MessageJobError("MEDIA_UNAVAILABLE", "Media is unavailable or invalid", 422, false);
  }

  const buffer = await readFile(resolvePrivateMediaPath(job.media.storagePath)).catch(() => null);
  if (!buffer) throw new MessageJobError("MEDIA_UNAVAILABLE", "Media file is unavailable", 410, false);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  if (checksum !== job.media.checksumSha256 || BigInt(buffer.length) !== job.media.sizeBytes) {
    throw new MessageJobError("MEDIA_INTEGRITY_FAILED", "Media failed integrity validation", 410, false);
  }

  const common = { caption: job.caption || undefined, mimetype: job.media.mimeType };
  if (job.type === "IMAGE") return { image: buffer, ...common };
  if (job.type === "VIDEO") return { video: buffer, ...common };
  if (job.type === "AUDIO") return { audio: buffer, mimetype: job.media.mimeType, ptt: false };
  return { document: buffer, fileName: job.media.originalName, ...common };
}

export async function dispatchQueuedMessage(job: ClaimedMessageJob) {
  const instance = waManager.getInstance(job.session.sessionId);
  if (!instance?.socket || instance.status !== "CONNECTED") {
    throw new MessageJobError("SESSION_NOT_READY", "WhatsApp device is not ready", 503, true);
  }

  const rateLimit = await checkPersistentRateLimit(`message-device:${job.sessionId}`, 30, 60_000);
  if (!rateLimit.success) {
    throw new MessageJobError("DEVICE_RATE_LIMITED", "Device delivery rate limit reached", 429, true);
  }

  const content = await buildMessageContent(job);
  const requestPayload = typeof job.requestPayload === "object" && job.requestPayload !== null && !Array.isArray(job.requestPayload)
    ? job.requestPayload
    : {};
  const quotedMessageId = typeof requestPayload.quotedMessageId === "string" ? requestPayload.quotedMessageId : undefined;
  const quoted = quotedMessageId
    ? await buildQuotedMessage(job.session.sessionId, job.recipient, quotedMessageId)
    : undefined;
  const result = await instance.socket.sendMessage(job.recipient, content, {
    messageId: job.whatsappMessageId ?? undefined,
    ...(quoted ? { quoted } : {}),
  });
  const messageId = result?.key.id ?? job.whatsappMessageId;
  if (!messageId) throw new MessageJobError("DELIVERY_RESULT_INVALID", "WhatsApp did not return a message identifier", 503, true);

  const webhookMessage: WAMessage = {
    key: result?.key ?? { id: messageId, remoteJid: job.recipient, fromMe: true },
    message: result?.message,
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
  void onMessageSent(job.session.sessionId, webhookMessage).catch(() => undefined);
  return { whatsappMessageId: messageId };
}
