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
  return sandbox as typeof sandbox & {
    pesanProBuildPayload: (event: unknown, config: unknown) => Record<string, unknown>;
    pesanProStableKey: (value: string) => string;
    pesanProRenderMessage: (template: string, fields: Record<string, unknown>, context: Record<string, unknown>) => string;
    pesanProTemplateFor: (config: unknown, formId: string) => string;
  };
}

function formEvent() {
  return {
    source: { getId: () => "form-1", getTitle: () => "Pendaftaran" },
    response: {
      getId: () => "response-1",
      getTimestamp: () => new Date("2026-09-05T10:00:00Z"),
      getRespondentEmail: () => "ayu@example.com",
      getItemResponses: () => [
        { getItem: () => ({ getTitle: () => "Nama Lengkap" }), getResponse: () => "Ayu" },
        { getItem: () => ({ getTitle: () => "Layanan" }), getResponse: () => ["API", "Webhook"] },
        { getItem: () => ({ getTitle: () => "Nomor WhatsApp" }), getResponse: () => "628123456789" },
      ],
    },
  };
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

describe("Google Forms per-form message templates", () => {
  it("renders field placeholders with spaces, lists, and form context before sending", () => {
    const script = loadScript();
    const config = { staticRecipient: "", recipientField: "Nomor WhatsApp", messageTemplate: "Halo {{field:Nama Lengkap}} dari {{formTitle}} (#{{responseId}}). Layanan: {{field:Layanan}}.", formTemplates: {} };
    const payload = script.pesanProBuildPayload(formEvent(), config);
    expect(payload.message).toBe("Halo Ayu dari Pendaftaran (#response-1). Layanan: API, Webhook.");
  });

  it("uses the template for the responding form over the script-wide default", () => {
    const script = loadScript();
    const config = {
      staticRecipient: "",
      recipientField: "Nomor WhatsApp",
      messageTemplate: "Pesan umum",
      formTemplates: { "form-1": "Khusus {{formId}}: {{field:Nama Lengkap}}" },
    };
    expect(script.pesanProTemplateFor(config, "form-1")).toBe("Khusus {{formId}}: {{field:Nama Lengkap}}");
    expect(script.pesanProBuildPayload(formEvent(), config).message).toBe("Khusus form-1: Ayu");
    expect(script.pesanProTemplateFor(config, "form-2")).toBe("Pesan umum");
  });

  it("omits message when there is no template or the template renders empty", () => {
    const script = loadScript();
    const plain = { staticRecipient: "", recipientField: "Nomor WhatsApp" };
    expect(script.pesanProBuildPayload(formEvent(), plain)).not.toHaveProperty("message");
    const empty = { ...plain, messageTemplate: "{{field:Tidak Ada}}", formTemplates: {} };
    expect(script.pesanProBuildPayload(formEvent(), empty)).not.toHaveProperty("message");
  });

  it("lists all answers, drops unknown placeholders, and caps the message", () => {
    const script = loadScript();
    const fields = { Nama: "Ayu", Kosong: "", Layanan: ["API", "Webhook"] };
    expect(script.pesanProRenderMessage("{{all_fields}}", fields, {})).toBe("Nama: Ayu\nKosong: -\nLayanan: API, Webhook");
    expect(script.pesanProRenderMessage("{{field:Tidak Ada}}|{{tanpa_nama}}|selesai", fields, {})).toBe("||selesai");
    expect(script.pesanProRenderMessage("x".repeat(5000), fields, {}).length).toBe(4096);
  });
});
