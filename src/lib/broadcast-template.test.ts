import { describe, expect, it } from "vitest";
import { extractBroadcastVariables, previewBroadcastTemplate, renderBroadcastTemplate, validateBroadcastTemplate } from "./broadcast-template";

describe("broadcast template variables", () => {
  it("keeps double-brace variables separate from spintax", () => {
    const template = "{Halo|Hai} {{name}}, invoice {{invoice_no}} sudah tersedia.";
    expect(validateBroadcastTemplate(template)).toMatchObject({ variables: ["name", "invoice_no"], combinations: 2 });
    const rendered = renderBroadcastTemplate(template, "seed", "recipient-1", { name: "Ayu", invoice_no: "INV-001" });
    expect(rendered).toMatch(/^(Halo|Hai) Ayu, invoice INV-001 sudah tersedia\.$/);
  });

  it("does not execute spintax-like text coming from CSV variables", () => {
    const rendered = renderBroadcastTemplate("Halo {{name}}", "seed", "recipient-1", { name: "{Ayu|Budi}" });
    expect(rendered).toBe("Halo {Ayu|Budi}");
  });

  it("requires values for variables during final rendering while preview can preserve placeholders", () => {
    expect(() => renderBroadcastTemplate("Halo {{name}}", "seed", "recipient-1", {})).toThrow(/Missing value/);
    expect(previewBroadcastTemplate("Halo {{name}}", {}, 1).samples[0]).toBe("Halo {{name}}");
  });

  it("deduplicates variable names in discovery order", () => {
    expect(extractBroadcastVariables("{{name}} {{invoice}} {{name}}")) .toEqual(["name", "invoice"]);
  });
});
