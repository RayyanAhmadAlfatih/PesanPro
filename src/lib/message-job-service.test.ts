import { describe, expect, it } from "vitest";
import { normalizeRecipient } from "./message-recipient";

describe("message recipients", () => {
  it("normalizes phone numbers to WhatsApp JIDs", () => {
    expect(normalizeRecipient("+62 81234567890")).toBe("6281234567890@s.whatsapp.net");
  });

  it("retains supported JIDs and rejects unsafe values", () => {
    expect(normalizeRecipient("120363012345678@g.us")).toBe("120363012345678@g.us");
    expect(() => normalizeRecipient("../../internal")).toThrow("Recipient must be");
  });
});
