import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePasswordReset } from "@/lib/password-reset";
import { passwordSchema } from "@/lib/password-policy";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

const resetSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`password-reset-consume:${ip}`, 10, 15 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many reset attempts. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rateLimit, 10) },
    );
  }

  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reset request" }, { status: 400 });
  }

  const result = await consumePasswordReset(parsed.data.token, parsed.data.password);
  if (!result.success) {
    return NextResponse.json({ error: "Reset link is invalid or expired" }, { status: 400 });
  }

  await recordAudit({
    userId: result.userId,
    action: "user.password_reset_completed",
    resource: "user",
    resourceId: result.userId,
    ip,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ success: true, message: "Password has been reset" });
}
