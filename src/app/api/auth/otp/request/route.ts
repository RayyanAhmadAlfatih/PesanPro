import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/rate-limit";
import { otpRequestSchema } from "@/lib/otp-input";
import { requestLoginOtp } from "@/lib/otp-service";

/**
 * Public by design: it runs before anyone is signed in. The proxy already lets
 * `/api/auth/*` through without a session.
 */
export async function POST(request: NextRequest) {
  const parsed = otpRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const result = await requestLoginOtp({
    email: parsed.data.email,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
  });

  if (result.ok) {
    return NextResponse.json({
      status: true,
      message: "Code sent.",
      data: { resendAfterMs: result.resendAfterMs },
    });
  }

  switch (result.reason) {
    case "rate_limited":
      return NextResponse.json(
        { error: "Too many code requests. Try again later." },
        { status: 429 },
      );
    case "cooldown":
      return NextResponse.json(
        { error: "Wait a moment before requesting another code.", data: { retryAfterMs: result.retryAfterMs } },
        { status: 429 },
      );
    case "email_unavailable":
      return NextResponse.json(
        { error: "Email delivery is not configured. Contact the administrator." },
        { status: 503 },
      );
    default:
      return NextResponse.json(
        { error: "This email cannot be used to sign in. Check it again or contact the administrator." },
        { status: 404 },
      );
  }
}
