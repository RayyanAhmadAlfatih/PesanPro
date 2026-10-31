import { describe, expect, it } from "vitest";
import { formatWhatsappDisplay, normalizeWhatsappNumber, whatsappHref } from "./support-contact";

describe("support WhatsApp contact", () => {
  it("normalises the shapes operators actually type", () => {
    expect(normalizeWhatsappNumber("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("6281234567890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("81234567890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("62081234567890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("")).toBe("");
    expect(normalizeWhatsappNumber(null)).toBe("");
  });

  it("builds a wa.me link with an encoded message", () => {
    expect(whatsappHref("0812-3456-7890", "Halo admin")).toBe("https://wa.me/6281234567890?text=Halo%20admin");
    expect(whatsappHref("")).toBeNull();
  });

  it("formats the number for display", () => {
    expect(formatWhatsappDisplay("081234567890")).toBe("+62 812-3456-7890");
    expect(formatWhatsappDisplay("")).toBe("");
  });
});
