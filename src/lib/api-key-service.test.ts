import { describe, expect, it } from "vitest";
import { API_KEY_SCOPES, hasApiKeyScope, isIpAllowed, parseApiKeyScopes, parseIpAllowlist } from "./api-key-service";

describe("API key scopes", () => {
  it("keeps only known unique scopes", () => {
    expect(parseApiKeyScopes(["message:send", "message:send", "invalid", 42])).toEqual(["message:send"]);
  });

  it("checks exact scopes without prefix escalation", () => {
    expect(hasApiKeyScope(["message:read"], "message:read")).toBe(true);
    expect(hasApiKeyScope(["message:read"], "message:send")).toBe(false);
  });

  it("publishes a stable non-empty scope registry", () => {
    expect(API_KEY_SCOPES).toContain("device:read");
    expect(API_KEY_SCOPES).toContain("webhook:write");
  });

  it("normalizes and enforces exact IP allowlists", () => {
    expect(parseIpAllowlist(["203.0.113.4", "::ffff:203.0.113.4", "2001:db8::1"]))
      .toEqual(["203.0.113.4", "2001:db8::1"]);
    expect(isIpAllowed(["203.0.113.4"], "::ffff:203.0.113.4")).toBe(true);
    expect(isIpAllowed(["203.0.113.4"], "203.0.113.5")).toBe(false);
    expect(isIpAllowed([], undefined)).toBe(true);
  });

  it("rejects malformed IP allowlists", () => {
    expect(() => parseIpAllowlist(["not-an-ip"])).toThrow(/invalid address/i);
  });
});
