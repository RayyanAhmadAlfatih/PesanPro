import { describe, expect, it } from "vitest";
import { normalizeClientIp, resolveTrustedClientIp, TRUSTED_CLIENT_IP_HEADER } from "./client-ip";
import { getClientIp } from "./rate-limit";

describe("normalizeClientIp", () => {
  it("accepts plain IPv4 and strips an IPv4 port suffix", () => {
    expect(normalizeClientIp("203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeClientIp("203.0.113.10:51234")).toBe("203.0.113.10");
  });

  it("accepts IPv6 and bracketed IPv6 with a port", () => {
    expect(normalizeClientIp("::1")).toBe("::1");
    expect(normalizeClientIp("[::1]")).toBe("::1");
    expect(normalizeClientIp("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  it("unwraps IPv4-mapped IPv6 addresses", () => {
    expect(normalizeClientIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
  });

  it("rejects non-addresses", () => {
    expect(normalizeClientIp("not-an-ip")).toBeNull();
    expect(normalizeClientIp("")).toBeNull();
    expect(normalizeClientIp(undefined)).toBeNull();
  });
});

describe("resolveTrustedClientIp", () => {
  it("ignores a spoofed forwarded chain when the proxy is not trusted", () => {
    expect(resolveTrustedClientIp({
      socketAddress: "198.51.100.7",
      forwardedFor: "203.0.113.10",
      trustProxy: false,
    })).toBe("198.51.100.7");
  });

  it("uses the socket address when no forwarded header is present", () => {
    expect(resolveTrustedClientIp({ socketAddress: "198.51.100.7", trustProxy: true })).toBe("198.51.100.7");
  });

  it("skips the configured number of trusted hops instead of trusting the leftmost entry", () => {
    // One trusted proxy in front. The client forged "1.1.1.1"; the proxy appended
    // the address it actually saw, so the real client is the rightmost entry.
    expect(resolveTrustedClientIp({
      socketAddress: "10.0.0.5",
      forwardedFor: "1.1.1.1, 203.0.113.10",
      trustProxy: true,
      trustedHops: 1,
    })).toBe("203.0.113.10");
  });

  it("walks past two trusted proxies to reach the real client", () => {
    // client -> proxy1 -> proxy2 -> app; both proxies appended their peer.
    expect(resolveTrustedClientIp({
      socketAddress: "10.0.0.5",
      forwardedFor: "1.1.1.1, 198.51.100.9, 10.0.0.9",
      trustProxy: true,
      trustedHops: 2,
    })).toBe("198.51.100.9");
  });

  it("falls back to the socket address when the chain is unusable", () => {
    expect(resolveTrustedClientIp({
      socketAddress: "198.51.100.7",
      forwardedFor: "garbage",
      trustProxy: true,
    })).toBe("198.51.100.7");
  });
});

describe("getClientIp", () => {
  it("prefers the transport-stamped header over client-controlled headers", () => {
    const headers = new Headers({
      [TRUSTED_CLIENT_IP_HEADER]: "198.51.100.7",
      "x-forwarded-for": "203.0.113.10",
    });
    expect(getClientIp(headers)).toBe("198.51.100.7");
  });

  it("falls back to x-forwarded-for when the trusted header is absent", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" });
    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("returns unknown when no usable header exists", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "nonsense" }))).toBe("unknown");
  });
});
