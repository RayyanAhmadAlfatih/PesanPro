import { describe, expect, it } from "vitest";
import { isTenantChatJid, readEditedText } from "./message-event-scope";

describe("message event scope", () => {
  it("rejects statuses, broadcast lists and channels", () => {
    expect(isTenantChatJid("status@broadcast")).toBe(false);
    expect(isTenantChatJid("120363183602004668@broadcast")).toBe(false);
    expect(isTenantChatJid("120363183602004668@newsletter")).toBe(false);
  });

  it("accepts personal, group and lid conversations", () => {
    expect(isTenantChatJid("6283877315731@s.whatsapp.net")).toBe(true);
    expect(isTenantChatJid("6283877315731@c.us")).toBe(true);
    expect(isTenantChatJid("120363183602004668@g.us")).toBe(true);
    expect(isTenantChatJid("154077874929843@lid")).toBe(true);
  });

  it("rejects an empty or missing jid", () => {
    expect(isTenantChatJid("")).toBe(false);
    expect(isTenantChatJid(null)).toBe(false);
    expect(isTenantChatJid(undefined)).toBe(false);
  });
});

describe("edited message text", () => {
  it("reads an already unwrapped edit", () => {
    expect(readEditedText({ conversation: "versi kedua" })).toBe("versi kedua");
    expect(readEditedText({ extendedTextMessage: { text: "versi kedua" } })).toBe("versi kedua");
  });

  it("reads the future-proof wrapper", () => {
    expect(readEditedText({ editedMessage: { message: { conversation: "versi kedua" } } } as never)).toBe("versi kedua");
    expect(readEditedText({ editedMessage: { message: { extendedTextMessage: { text: "versi kedua" } } } } as never)).toBe("versi kedua");
  });

  it("reads content stored directly on the wrapper", () => {
    expect(readEditedText({ editedMessage: { conversation: "versi kedua" } } as never)).toBe("versi kedua");
  });

  it("returns an empty string when the edit carries no text", () => {
    expect(readEditedText({ editedMessage: { message: {} } } as never)).toBe("");
    expect(readEditedText({ conversation: "" })).toBe("");
    expect(readEditedText(null)).toBe("");
    expect(readEditedText(undefined)).toBe("");
  });
});
