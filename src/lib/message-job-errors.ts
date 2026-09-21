export class MessageJobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "MessageJobError";
  }
}

export function classifyMessageDispatchError(error: unknown): MessageJobError {
  if (error instanceof MessageJobError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("disconnected") || message.includes("not ready") || message.includes("not found")) {
    return new MessageJobError("SESSION_NOT_READY", "WhatsApp device is not ready", 503, true);
  }
  if (message.includes("timeout") || message.includes("network") || message.includes("connection")) {
    return new MessageJobError("TEMPORARY_DELIVERY_ERROR", "Temporary delivery failure", 503, true);
  }
  if (message.includes("jid") || message.includes("recipient")) {
    return new MessageJobError("INVALID_RECIPIENT", "Recipient is invalid", 422, false);
  }
  if (message.includes("media") || message.includes("file")) {
    return new MessageJobError("MEDIA_UNAVAILABLE", "Media is unavailable or invalid", 422, false);
  }
  return new MessageJobError("DELIVERY_FAILED", "Message delivery failed", 500, true);
}
