import { describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtpCode,
  isOtpChallengeActive,
  isOtpCodeFormat,
  normalizeOtpCode,
  OTP_CODE_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  otpAttemptsRemaining,
  otpResendWaitMs,
  verifyOtpCode,
} from "./otp-policy";

const SECRET = "a".repeat(32);

describe("otp policy", () => {
  it("generates a fixed-length numeric code", () => {
    for (let index = 0; index < 200; index += 1) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_CODE_LENGTH);
      expect(isOtpCodeFormat(code)).toBe(true);
    }
  });

  it("keeps leading zeros instead of dropping them", () => {
    // The generator pads, so a code like "000123" stays six digits.
    const codes = Array.from({ length: 400 }, () => generateOtpCode());
    expect(codes.every((code) => code.length === OTP_CODE_LENGTH)).toBe(true);
  });

  it("normalizes a pasted code", () => {
    expect(normalizeOtpCode(" 123 456 ")).toBe("123456");
    expect(normalizeOtpCode("123-456")).toBe("123456");
    expect(normalizeOtpCode("123456")).toBe("123456");
  });

  it("rejects anything that is not six digits", () => {
    expect(isOtpCodeFormat("12345")).toBe(false);
    expect(isOtpCodeFormat("1234567")).toBe(false);
    expect(isOtpCodeFormat("12345a")).toBe(false);
    expect(isOtpCodeFormat("")).toBe(false);
  });

  it("verifies a code against its own hash only", () => {
    const code = "123456";
    const hash = hashOtpCode(code, SECRET);
    expect(verifyOtpCode(code, hash, SECRET)).toBe(true);
    expect(verifyOtpCode("123457", hash, SECRET)).toBe(false);
    expect(verifyOtpCode(code, hash, "b".repeat(32))).toBe(false);
  });

  it("fails safely on a malformed stored hash instead of throwing", () => {
    expect(verifyOtpCode("123456", "not-hex", SECRET)).toBe(false);
    expect(verifyOtpCode("123456", "", SECRET)).toBe(false);
    expect(verifyOtpCode("123456", "ab", SECRET)).toBe(false);
  });

  it("produces a stable hash for the same code and secret", () => {
    expect(hashOtpCode("000001", SECRET)).toBe(hashOtpCode("000001", SECRET));
    expect(hashOtpCode("000001", SECRET)).toHaveLength(64);
  });

  it("treats a challenge as active only before expiry, consumption, and the attempt cap", () => {
    const now = new Date("2026-10-12T10:00:00.000Z");
    const base = { consumedAt: null, expiresAt: new Date(now.getTime() + 60_000), attempts: 0 };

    expect(isOtpChallengeActive(base, now)).toBe(true);
    expect(isOtpChallengeActive({ ...base, consumedAt: now }, now)).toBe(false);
    expect(isOtpChallengeActive({ ...base, expiresAt: now }, now)).toBe(false);
    expect(isOtpChallengeActive({ ...base, attempts: OTP_MAX_ATTEMPTS }, now)).toBe(false);
    expect(isOtpChallengeActive({ ...base, attempts: OTP_MAX_ATTEMPTS - 1 }, now)).toBe(true);
  });

  it("counts down the resend cooldown and stops at zero", () => {
    const now = new Date("2026-10-12T10:00:00.000Z");
    expect(otpResendWaitMs(null, now)).toBe(0);
    expect(otpResendWaitMs(new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS), now)).toBe(0);
    expect(otpResendWaitMs(new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS - 1000), now)).toBe(0);
    expect(otpResendWaitMs(new Date(now.getTime() - 20_000), now)).toBe(40_000);
  });

  it("reports the attempts left before the code burns", () => {
    expect(otpAttemptsRemaining(0)).toBe(OTP_MAX_ATTEMPTS);
    expect(otpAttemptsRemaining(2)).toBe(1);
    expect(otpAttemptsRemaining(OTP_MAX_ATTEMPTS)).toBe(0);
    expect(otpAttemptsRemaining(99)).toBe(0);
  });
});
