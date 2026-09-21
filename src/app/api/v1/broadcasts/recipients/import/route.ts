import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { MAX_BROADCAST_CSV_BYTES, parseBroadcastRecipientCsv } from "@/lib/broadcast-csv";
import { MessageJobError } from "@/lib/message-job-errors";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!contentType || !["text/csv", "application/csv", "text/plain"].includes(contentType)) {
      throw new MessageJobError("INVALID_RECIPIENT_CSV", "Content-Type must be text/csv", 415, false);
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BROADCAST_CSV_BYTES) {
      throw new MessageJobError("INVALID_RECIPIENT_CSV", "CSV cannot exceed 2 MB", 413, false);
    }
    return apiV1Success(requestId, await parseBroadcastRecipientCsv(request.body));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
