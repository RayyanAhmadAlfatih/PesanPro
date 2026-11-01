import { describe, expect, it } from "vitest";
import { MessageJobError } from "./message-job-errors";
import { normalizeRecipient, normalizePhoneNumber } from "./message-recipient";

describe("recipient normalization", () => {
  it("converts local Indonesian numbers and strips formatting", () => {
    expect(normalizeRecipient("0812-3456-7890")).toBe("6281234567890@s.whatsapp.net");
    expect(normalizeRecipient("+62 812 3456 7890")).toBe("6281234567890@s.whatsapp.net");
    expect(normalizeRecipient("6281234567890")).toBe("6281234567890@s.whatsapp.net");
    expect(normalizeRecipient("14155552671")).toBe("14155552671@s.whatsapp.net");
  });

  it("accepts supported WhatsApp JIDs unchanged", () => {
    expect(normalizeRecipient("120363183602004668@g.us")).toBe("120363183602004668@g.us");
    expect(normalizeRecipient("628123456789@s.whatsapp.net")).toBe("628123456789@s.whatsapp.net");
    expect(normalizeRecipient("123456789@lid")).toBe("123456789@lid");
  });

  it("accepts WhatsApp Channel (newsletter) JIDs", () => {
    // The legacy media endpoint ships newsletter-specific handling, so the
    // shared normalizer must not silently reject channels.
    expect(normalizeRecipient("123456789@newsletter")).toBe("123456789@newsletter");
  });

  it("rejects values that are neither phone numbers nor supported JIDs", () => {
    expect(() => normalizeRecipient("status@broadcast")).toThrow(MessageJobError);
    expect(() => normalizeRecipient("not a recipient")).toThrow(MessageJobError);
  });

  it("normalizes pairing phone numbers the same way", () => {
    expect(normalizePhoneNumber("0812-3456-7890")).toBe("6281234567890");
    expect(normalizePhoneNumber("(0812) 3456.7890")).toBe("6281234567890");
    expect(() => normalizePhoneNumber("12345")).toThrow(MessageJobError);
  });
});
