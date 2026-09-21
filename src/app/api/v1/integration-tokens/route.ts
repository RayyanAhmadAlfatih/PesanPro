import { IntegrationType } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { createIntegrationToken, listIntegrationTokens } from "@/lib/integration-service";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.nativeEnum(IntegrationType),
  sessionId: z.string().min(1).max(191),
  expiresAt: z.string().datetime().nullable().optional(),
  mapping: z.object({
    staticRecipient: z.string().trim().min(7).max(100).optional(),
    recipientField: z.string().trim().min(1).max(120).optional(),
    messageTemplate: z.string().trim().min(1).max(4096).optional(),
  }).strict().optional(),
});

function actor(user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>) {
  return { id: user.id, role: user.role, ownerId: user.ownerId, email: user.email, apiKeyId: user.apiKeyId };
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await listIntegrationTokens(actor(user)));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const parsed = createSchema.parse(await request.json());
    const expiresAt = parsed.expiresAt === undefined ? undefined : parsed.expiresAt === null ? null : new Date(parsed.expiresAt);
    const result = await createIntegrationToken(actor(user), { name: parsed.name, type: parsed.type, sessionId: parsed.sessionId, mapping: parsed.mapping, expiresAt }, request.headers);
    return apiV1Success(requestId, result, 201);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
