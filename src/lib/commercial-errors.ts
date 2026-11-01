import { NextResponse } from "next/server";
import { EntitlementDeniedError, SubscriptionInactiveError } from "./billing";
import { QuotaExceededError } from "./usage";
import { MessageSafetyRateLimitError } from "./message-quota";
import { MessageJobError } from "./message-job-errors";
import { rateLimitHeaders } from "./rate-limit";

export function commercialErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof MessageSafetyRateLimitError) {
    return NextResponse.json({
      status: false,
      error: "Too many message operations",
      code: "RATE_LIMITED",
    }, { status: 429, headers: rateLimitHeaders(error.result, error.limit) });
  }
  if (error instanceof QuotaExceededError) {
    return NextResponse.json({
      status: false,
      error: "Quota exceeded",
      code: "QUOTA_EXCEEDED",
      feature: error.feature,
      limit: error.limit.toString(),
    }, { status: 429 });
  }
  if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
    return NextResponse.json({
      status: false,
      error: error.message,
      code: "ENTITLEMENT_DENIED",
    }, { status: 403 });
  }
  // Message job errors already carry a safe message and the right HTTP status;
  // without this mapping they fell through to a generic 500.
  if (error instanceof MessageJobError) {
    return NextResponse.json({
      status: false,
      error: error.message,
      code: error.code,
    }, { status: error.status });
  }
  return null;
}
