import { describe, expect, it } from "vitest";
import type { BotConfig } from "@prisma/client";
import { getAutoReplyAccessReason } from "./autoreply-access";

function config(overrides: Partial<BotConfig> = {}) {
  return {
    enabled: true,
    autoReplyMode: "ALL",
    autoReplyAllowedJids: null,
    autoReplyBlockedJids: null,
    ...overrides,
  } as BotConfig;
}

describe("auto-reply sender access", () => {
  it("allows inbound by default but never treats OWNER mode as self-reply", () => {
    expect(getAutoReplyAccessReason(null, "6281@s.whatsapp.net")).toBeNull();
    expect(getAutoReplyAccessReason(config({ autoReplyMode: "OWNER" }), "6281@s.whatsapp.net")).toBe("OWNER_MODE_IGNORES_INBOUND");
  });

  it("uses exact allow/block JID checks instead of substring matching", () => {
    expect(getAutoReplyAccessReason(config({ autoReplyMode: "SPECIFIC", autoReplyAllowedJids: ["6281@s.whatsapp.net"] }), "6281@s.whatsapp.net")).toBeNull();
    expect(getAutoReplyAccessReason(config({ autoReplyMode: "SPECIFIC", autoReplyAllowedJids: ["6281@s.whatsapp.net"] }), "16281@s.whatsapp.net")).toBe("SENDER_NOT_ALLOWED");
    expect(getAutoReplyAccessReason(config({ autoReplyMode: "BLACKLIST", autoReplyBlockedJids: ["6281@s.whatsapp.net"] }), "6281@s.whatsapp.net")).toBe("SENDER_BLOCKED");
  });

  it("honors the global bot disable switch", () => {
    expect(getAutoReplyAccessReason(config({ enabled: false }), "6281@s.whatsapp.net")).toBe("BOT_DISABLED");
  });
});
