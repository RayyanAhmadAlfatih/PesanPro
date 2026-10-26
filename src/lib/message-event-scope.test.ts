import { describe, expect, it } from "vitest";
import { isTenantChatJid } from "./message-event-scope";

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
