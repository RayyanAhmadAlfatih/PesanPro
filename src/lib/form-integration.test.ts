import { describe, expect, it } from "vitest";
import { buildDefaultFormMessage, formFieldsSchema, formMetadata, normalizeFormFields } from "./form-integration";
import { applyIntegrationMapping } from "./integration-contract";

describe("structured form integration contract", () => {
  it("normalizes multiline and array values without executing field names", () => {
    const fields = normalizeFormFields({ "Nomor WhatsApp": [" 628123456789 ", ""], "Pesan": "Halo\r\nDunia\0" });
    expect(fields).toEqual({ "Nomor WhatsApp": "628123456789", Pesan: "Halo\nDunia" });
    expect(formMetadata(fields)).toMatchObject({ "field.Nomor WhatsApp": "628123456789", "field.Pesan": "Halo\nDunia" });
  });

  it("maps recipient and templates by exact field title", () => {
    const mapped = applyIntegrationMapping({
      recipientField: "Nomor WhatsApp",
      messageTemplate: "Halo {{field:Nama}}, tiket {{sourceId}}: {{field:Pesan}}",
    }, {
      recipient: "",
      sourceId: "submission-1",
      message: "fallback",
      metadata: { "field.Nomor WhatsApp": "628123456789", "field.Nama": "Yusuf", "field.Pesan": "Butuh demo" },
    });
    expect(mapped.recipient).toBe("628123456789");
    expect(mapped.message).toBe("Halo Yusuf, tiket submission-1: Butuh demo");
  });

  it("builds a bounded default message and rejects oversized field sets", () => {
    expect(buildDefaultFormMessage("Contact Form 7", "Kontak", { Nama: "Yusuf" })).toBe("Contact Form 7 - Kontak\nNama: Yusuf");
    const fields = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`field-${index}`, "x"]));
    expect(formFieldsSchema.safeParse(fields).success).toBe(false);
    expect(() => buildDefaultFormMessage("Google Forms", undefined, { Message: "x".repeat(4090) })).toThrow();
  });
});
