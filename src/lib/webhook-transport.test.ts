import { describe, expect, it, vi } from "vitest";
import { verifyWebhookRequest } from "./webhook-contract";
import { deliverWebhookHttp, resolveWebhookTarget, WebhookTransportError } from "./webhook-transport";

const publicResolver = async () => [{ address: "1.1.1.1", family: 4 }];

describe("webhook network safety", () => {
  it.each([
    "http://public.example/hook",
    "https://user:pass@public.example/hook",
    "https://public.example:8443/hook",
    "https://127.0.0.1/hook",
    "https://[::ffff:7f00:1]/hook",
    "https://169.254.169.254/latest/meta-data",
  ])("blocks unsafe destination %s", async (url) => {
    await expect(resolveWebhookTarget(url, { resolver: publicResolver })).rejects.toBeInstanceOf(WebhookTransportError);
  });

  it("rejects a hostname when any DNS answer is private", async () => {
    await expect(resolveWebhookTarget("https://public.example/hook", {
      resolver: async () => [{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.2", family: 4 }],
    })).rejects.toMatchObject({ code: "PRIVATE_ADDRESS_BLOCKED", retryable: false });
  });

  it("revalidates and blocks a redirect to a private address", async () => {
    const executor = vi.fn().mockResolvedValue({ statusCode: 307, responseTimeMs: 2, responseSizeBytes: 0, location: "https://127.0.0.1/internal" });
    await expect(deliverWebhookHttp({
      url: "https://public.example/hook",
      body: "{}",
      eventId: "wh_evt_12345678",
      deliveryId: "wh_delivery_12345678",
      secret: "x".repeat(32),
      resolver: publicResolver,
      requestExecutor: executor,
    })).rejects.toMatchObject({ code: "PRIVATE_ADDRESS_BLOCKED" });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("pins a public IP and emits verifiable current and transition signatures", async () => {
    const body = JSON.stringify({ id: "wh_evt_12345678" });
    const currentSecret = "current-secret-abcdefghijklmnopqrstuvwxyz";
    const previousSecret = "previous-secret-abcdefghijklmnopqrstuvwxyz";
    const executor = vi.fn(async ({ target, headers }: { target: { address: string }; headers: Record<string, string> }) => {
      expect(target.address).toBe("1.1.1.1");
      expect(headers["X-PesanPro-Signature-Previous"]).toMatch(/^v1=[a-f0-9]{64}$/);
      const verification = verifyWebhookRequest({ body, secret: currentSecret, headers, nowMs: 1_788_048_000_000 });
      expect(verification.valid).toBe(true);
      expect(verifyWebhookRequest({ body, secret: previousSecret, headers: { ...headers, "X-PesanPro-Signature": headers["X-PesanPro-Signature-Previous"] }, nowMs: 1_788_048_000_000 }).valid).toBe(true);
      return { statusCode: 204, responseTimeMs: 3, responseSizeBytes: 0, location: null };
    });
    await expect(deliverWebhookHttp({
      url: "https://public.example/hook",
      body,
      eventId: "wh_evt_12345678",
      deliveryId: "wh_delivery_12345678",
      secret: currentSecret,
      previousSecret,
      nowMs: 1_788_048_000_000,
      resolver: publicResolver,
      requestExecutor: executor,
    })).resolves.toMatchObject({ statusCode: 204 });
  });

  it("classifies a server failure as retryable without storing its body", async () => {
    await expect(deliverWebhookHttp({
      url: "https://public.example/hook",
      body: "{}",
      eventId: "wh_evt_12345678",
      deliveryId: "wh_delivery_12345678",
      secret: "x".repeat(32),
      resolver: publicResolver,
      requestExecutor: async () => ({ statusCode: 503, responseTimeMs: 3, responseSizeBytes: 12, location: null }),
    })).rejects.toMatchObject({ code: "HTTP_503", retryable: true });
  });
});

