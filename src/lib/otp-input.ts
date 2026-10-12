import { z } from "zod";
import { OTP_CODE_LENGTH } from "./otp-policy";

const email = z.string().trim().toLowerCase().email().max(320);

export const otpRequestSchema = z.object({ email }).strict();

// Not strict: NextAuth builds the object handed to `authorize`, and it may carry
// extra keys such as csrfToken. Zod strips what it does not know, so only the
// two fields below are ever read.
export const otpVerifySchema = z.object({
  email,
  code: z.string().trim().regex(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`), "Code must be six digits"),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
