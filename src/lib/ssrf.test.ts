import { describe, it, expect } from "vitest";
import { _internal, SSRFError, validatePublicUrl } from "./ssrf";

describe("SSRF private IP detection", () => {
  const { isPrivateIPv4, isPrivateIPv6, isPrivateIP } = _internal;

  it("blocks private IPv4 ranges", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("172.16.5.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("169.254.169.254")).toBe(true);
    expect(isPrivateIPv4("0.0.0.1")).toBe(true);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
  });

  it("blocks private IPv6", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIPv6("ff02::1")).toBe(true);
    expect(isPrivateIPv6("2001:4860:4860::8888")).toBe(false);
  });

  it("isPrivateIP delegates", () => {
    expect(isPrivateIP("10.1.1.1")).toBe(true);
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("not-an-ip")).toBe(false);
  });

  it("validatePublicUrl rejects non-http protocols", async () => {
    await expect(validatePublicUrl("file:///etc/passwd")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("ftp://example.com")).rejects.toThrow(SSRFError);
  });

  it("validatePublicUrl rejects URLs with credentials", async () => {
    await expect(validatePublicUrl("http://user:pass@example.com/")).rejects.toThrow(SSRFError);
  });

  it("validatePublicUrl rejects localhost hostname", async () => {
    await expect(validatePublicUrl("http://localhost/admin")).rejects.toThrow(SSRFError);
  });

  it("validatePublicUrl rejects private IP literals", async () => {
    await expect(validatePublicUrl("http://192.168.1.1/secret")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("http://10.0.0.1/")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("http://127.0.0.1:3000/api")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("https://[::ffff:7f00:1]/internal")).rejects.toThrow(SSRFError);
  });

  it("validatePublicUrl allows public URL", async () => {
    const url = await validatePublicUrl("https://8.8.8.8/webhook");
    expect(url.hostname).toBe("8.8.8.8");
  });

  it("validatePublicUrl rejects non-standard destination ports", async () => {
    await expect(validatePublicUrl("https://8.8.8.8:8443/media")).rejects.toThrow(SSRFError);
  });
});
