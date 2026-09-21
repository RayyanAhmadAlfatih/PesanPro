export type SimulatedWebhookDelivery = {
  id: string;
  eventId: string;
  status: "PENDING" | "PROCESSING" | "RETRYING" | "SUCCEEDED" | "DEAD_LETTER";
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  lockedBy: string | null;
  leaseExpiresAt: number | null;
};

export function claimSimulatedWebhookDelivery(state: SimulatedWebhookDelivery, workerId: string, now: number, leaseMs: number) {
  const available = (state.status === "PENDING" || state.status === "RETRYING") && state.availableAt <= now;
  const expired = state.status === "PROCESSING" && state.leaseExpiresAt !== null && state.leaseExpiresAt < now;
  if ((!available && !expired) || state.attempts >= state.maxAttempts) return null;
  const claimToken = `${workerId}:${state.attempts + 1}`;
  state.status = "PROCESSING";
  state.attempts += 1;
  state.lockedBy = claimToken;
  state.leaseExpiresAt = now + leaseMs;
  return claimToken;
}

export function completeSimulatedWebhookDelivery(state: SimulatedWebhookDelivery, claimToken: string) {
  if (state.status !== "PROCESSING" || state.lockedBy !== claimToken) return false;
  state.status = "SUCCEEDED";
  state.lockedBy = null;
  state.leaseExpiresAt = null;
  return true;
}

export function failSimulatedWebhookDelivery(state: SimulatedWebhookDelivery, claimToken: string, retryable: boolean, retryAt: number) {
  if (state.status !== "PROCESSING" || state.lockedBy !== claimToken) return false;
  state.status = retryable && state.attempts < state.maxAttempts ? "RETRYING" : "DEAD_LETTER";
  state.availableAt = retryAt;
  state.lockedBy = null;
  state.leaseExpiresAt = null;
  return true;
}

export function recoverSimulatedWebhookWorker(state: SimulatedWebhookDelivery, workerId: string, now: number) {
  if (state.status !== "PROCESSING" || !state.lockedBy?.startsWith(`${workerId}:`)) return false;
  state.status = state.attempts >= state.maxAttempts ? "DEAD_LETTER" : "RETRYING";
  state.availableAt = now;
  state.lockedBy = null;
  state.leaseExpiresAt = null;
  return true;
}

