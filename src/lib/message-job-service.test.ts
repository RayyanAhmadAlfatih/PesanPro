import { describe, expect, it } from "vitest";
import { normalizeRecipient } from "./message-recipient";

describe("message recipients", () => {
  it("normalizes phone numbers to WhatsApp JIDs", () => {
    expect(normalizeRecipient("+62 81234567890")).toBe("6281234567890@s.whatsapp.net");
    expect(normalizeRecipient("6281234567890")).toBe("6281234567890@s.whatsapp.net");
  });

  it("converts local Indonesian 08 numbers to international JIDs", () => {
    expect(normalizeRecipient("083877315731")).toBe("6283877315731@s.whatsapp.net");
    expect(normalizeRecipient("08 3877 315731")).toBe("6283877315731@s.whatsapp.net");
    expect(normalizeRecipient("0812345678")).toBe("62812345678@s.whatsapp.net");
  });

  it("keeps numbers that are not local mobile numbers unchanged", () => {
    expect(normalizeRecipient("0215551234")).toBe("0215551234@s.whatsapp.net");
  });

  it("retains supported JIDs and rejects unsafe values", () => {
    expect(normalizeRecipient("120363012345678@g.us")).toBe("120363012345678@g.us");
    expect(() => normalizeRecipient("../../internal")).toThrow("Recipient must be");
  });
});
