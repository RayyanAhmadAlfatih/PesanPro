import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadScript() {
  const source = readFileSync(path.join(process.cwd(), "integrations/google-forms/Code.gs"), "utf8");
  const sandbox = {
    Array,
    JSON,
    String,
    Math,
    Error,
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: vi.fn(() => Array.from({ length: 32 }, (_, index) => index)),
      sleep: vi.fn(),
    },
  };
  vm.runInNewContext(source, sandbox);
  return sandbox as typeof sandbox & { pesanProBuildPayload: (event: unknown, config: unknown) => Record<string, unknown>; pesanProStableKey: (value: string) => string };
}

describe("Google Forms Apps Script package", () => {
  it("builds structured fields and a stable response identity", () => {
    const script = loadScript();
    const timestamp = new Date("2026-09-05T10:00:00Z");
    const event = {
      source: { getId: () => "form-1", getTitle: () => "Kontak" },
      response: {
        getId: () => "response-1",
        getTimestamp: () => timestamp,
        getRespondentEmail: () => "owner@example.com",
        getItemResponses: () => [
          { getItem: () => ({ getTitle: () => "Nomor WhatsApp" }), getResponse: () => "628123456789" },
          { getItem: () => ({ getTitle: () => "Layanan" }), getResponse: () => ["API", "Webhook"] },
        ],
      },
    };
    expect(script.pesanProBuildPayload(event, { staticRecipient: "", recipientField: "Nomor WhatsApp" })).toMatchObject({
      responseId: "response-1",
      formId: "form-1",
      recipient: "628123456789",
      fields: { "Nomor WhatsApp": "628123456789", Layanan: ["API", "Webhook"] },
    });
    expect(script.pesanProStableKey("form-1:response-1")).toMatch(/^gf-[a-f0-9]{64}$/);
  });

  it("contains no hardcoded integration token and requires secure delivery controls", () => {
    const source = readFileSync(path.join(process.cwd(), "integrations/google-forms/Code.gs"), "utf8");
    expect(source).not.toMatch(/ppint_[A-Za-z0-9_-]{20,}/);
    expect(source).toContain("PropertiesService.getScriptProperties");
    expect(source).toContain("validateHttpsCertificates: true");
    expect(source).toContain("followRedirects: false");
    expect(source).toContain("Idempotency-Key");
  });
});
