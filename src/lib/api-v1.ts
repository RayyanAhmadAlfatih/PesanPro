import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { EntitlementDeniedError, SubscriptionInactiveError } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { QuotaExceededError } from "./usage";

export function getRequestId(headers: Headers) {
  const provided = headers.get("x-request-id")?.trim();
  return provided && /^[A-Za-z0-9._:-]{1,100}$/.test(provided) ? provided : crypto.randomUUID();
}

export function apiV1Success(requestId: string, data: unknown, status = 200, meta?: unknown) {
  return NextResponse.json({ requestId, data, ...(meta === undefined ? {} : { meta }) }, {
    status,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}

export function apiV1Error(requestId: string, code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json({
    requestId,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  }, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

export function apiV1Exception(requestId: string, error: unknown) {
  if (error instanceof MessageJobError) return apiV1Error(requestId, error.code, error.message, error.status);
  if (error instanceof QuotaExceededError) return apiV1Error(requestId, "QUOTA_EXCEEDED", "Message quota has been reached", 429, { limit: error.limit.toString() });
  if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
    return apiV1Error(requestId, "ENTITLEMENT_DENIED", error.message, 403);
  }
  if (error instanceof z.ZodError) {
    return apiV1Error(requestId, "VALIDATION_ERROR", "Request validation failed", 422, error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
  }
  return apiV1Error(requestId, "INTERNAL_ERROR", "An internal error occurred", 500);
}

export function requireIdempotencyKey(headers: Headers) {
  const value = headers.get("idempotency-key")?.trim();
  if (!value || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new MessageJobError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8-128 URL-safe characters", 422, false);
  }
  return value;
}
