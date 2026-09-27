import { afterEach, describe, expect, it, vi } from "vitest";
import { _internal, PublicFetchError, SSRFError, validatePublicUrl } from "./ssrf";

function body(...chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) yield Buffer.from(chunk);
  })();
}

describe("SSRF private IP detection", () => {
  const { isPrivateIPv4, isPrivateIPv6, isPrivateIP } = _internal;

  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(isPrivateIPv6("fd12::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
    expect(isPrivateIPv6("fe90::1")).toBe(true);
    expect(isPrivateIPv6("64:ff9b::7f00:1")).toBe(true);
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
    await expect(validatePublicUrl("http://127.0.0.1/api")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SSRFError);
    await expect(validatePublicUrl("https://[::ffff:7f00:1]/internal")).rejects.toThrow(SSRFError);
  });

  it("validatePublicUrl allows public IP URL", async () => {
    const url = await validatePublicUrl("https://8.8.8.8/webhook");
    expect(url.hostname).toBe("8.8.8.8");
  });

  it("validatePublicUrl rejects non-standard destination ports", async () => {
    await expect(validatePublicUrl("https://8.8.8.8:8443/media")).rejects.toThrow(SSRFError);
  });
});

describe("pinned public fetch", () => {
  const fetchWith = _internal.fetchPublicBufferWithDependencies;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pins the connection to the address validated at delivery time even if DNS changes afterward", async () => {
    let currentDns = "8.8.8.8";
    const resolve = vi.fn(async () => [{ address: currentDns, family: 4 as const }]);
    const request = vi.fn(async (_url: URL, address: { address: string }) => {
      currentDns = "127.0.0.1";
      expect(address.address).toBe("8.8.8.8");
      return {
        statusCode: 200,
        headers: { "content-type": "image/webp" },
        body: body("safe-bytes"),
      };
    });

    const result = await fetchWith("https://cdn.example.com/photo.webp", { maxBytes: 1024 }, { resolve, request });

    expect(result.buffer.toString()).toBe("safe-bytes");
    expect(request).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("rejects a DNS answer set containing any private address before connecting", async () => {
    const request = vi.fn();
    await expect(fetchWith("https://cdn.example.com/file", {}, {
      resolve: vi.fn(async () => [
        { address: "8.8.8.8", family: 4 as const },
        { address: "10.0.0.8", family: 4 as const },
      ]),
      request,
    })).rejects.toThrow(SSRFError);
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates redirects and blocks a public-to-private redirect", async () => {
    const request = vi.fn(async () => ({
      statusCode: 302,
      headers: { location: "http://127.0.0.1/latest/meta-data" },
      body: body(),
    }));

    await expect(fetchWith("https://cdn.example.com/file", { maxRedirects: 3 }, {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
      request,
    })).rejects.toThrow(SSRFError);
    expect(request).toHaveBeenCalledOnce();
  });

  it("enforces the byte limit while reading a chunked response", async () => {
    await expect(fetchWith("https://cdn.example.com/large", { maxBytes: 5 }, {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
      request: vi.fn(async () => ({
        statusCode: 200,
        headers: { "content-type": "application/octet-stream" },
        body: body("123", "456"),
      })),
    })).rejects.toMatchObject({
      code: "REMOTE_FETCH_TOO_LARGE",
      retryable: false,
    } satisfies Partial<PublicFetchError>);
  });

  it("times out a stalled remote server", async () => {
    vi.useFakeTimers();
    const pending = fetchWith("https://cdn.example.com/stalled", { timeoutMs: 25 }, {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
      request: vi.fn(async () => new Promise<never>(() => undefined)),
    });

    const assertion = expect(pending).rejects.toMatchObject({
      code: "REMOTE_FETCH_TIMEOUT",
      retryable: true,
    } satisfies Partial<PublicFetchError>);
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
  });
});
