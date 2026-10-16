import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`password-reset-request:${ip}`, 5, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many reset requests. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rateLimit, 5) },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // Per-email throttle on top of the per-IP limit: without it, an attacker with
  // an IP pool can flood a victim's mailbox and invalidate their outstanding
  // reset tokens on every request.
  const emailRateLimit = await checkPersistentRateLimit(`password-reset-request:email:${parsed.data.email}`, 3, 15 * 60 * 1000);
  if (!emailRateLimit.success) {
    return NextResponse.json(
      { error: "Too many reset requests for this email. Please try again later." },
      { status: 429, headers: rateLimitHeaders(emailRateLimit, 3) },
    );
  }

  await requestPasswordReset(parsed.data.email);
  await recordAudit({
    userEmail: parsed.data.email,
    action: "user.password_reset_requested",
    resource: "user",
    ip,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    success: true,
    message: "If the account exists, reset instructions have been sent.",
  });
}
