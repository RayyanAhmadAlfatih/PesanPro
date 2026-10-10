import { describe, expect, it } from "vitest";
import { browserIdentity } from "./wa-device-identity";

describe("WhatsApp device identity", () => {
  it("stays stable for the same session across reconnects", () => {
    const first = browserIdentity("tenant-a-session");
    expect(browserIdentity("tenant-a-session")).toEqual(first);
    expect(browserIdentity("tenant-a-session")).toEqual(first);
  });

  it("differs between sessions so no single product fingerprint exists", () => {
    const identities = Array.from({ length: 32 }, (_, index) => browserIdentity(`session-${index}`));
    const distinct = new Set(identities.map((identity) => identity.join("|")));

    expect(distinct.size).toBeGreaterThan(1);
  });

  it("never advertises the library and always reports a plausible version", () => {
    for (let index = 0; index < 32; index += 1) {
      const identity = browserIdentity(`session-${index}`);
      expect(identity).toHaveLength(3);
      expect(identity[0]).not.toBe("Baileys");
      expect(identity[1]).not.toBe("Baileys");
      expect(identity[2]).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
