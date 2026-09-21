import { describe, expect, it } from "vitest";
import { contactProfileWriteSchema, segmentDefinitionSchema } from "./segment-input";
import { assertSegmentComplexity, matchesSegmentAttributes, segmentComplexity, uniqueIds } from "./segment-policy";

describe("segment safety policy", () => {
  it("normalizes safe sources and supplies bounded defaults", () => {
    const parsed = segmentDefinitionSchema.parse({ sources: ["whatsapp", "CRM"] });
    expect(parsed.sources).toEqual(["WHATSAPP", "CRM"]);
    expect(parsed.attributes).toEqual([]);
    expect(parsed.tagIds).toEqual([]);
  });

  it("rejects arbitrary attribute operators and unsafe paths", () => {
    expect(() => segmentDefinitionSchema.parse({ attributes: [{ key: "__proto__.admin", operator: "SQL", value: "1" }] })).toThrow();
    expect(() => segmentDefinitionSchema.parse({ attributes: [{ key: "address city", operator: "EQUALS", value: "Bandung" }] })).toThrow();
  });

  it("matches nested equals, contains, and exists filters with AND semantics", () => {
    const filters = segmentDefinitionSchema.parse({ attributes: [
      { key: "address.city", operator: "EQUALS", value: "Bandung" },
      { key: "tier", operator: "CONTAINS", value: "gold" },
      { key: "verified", operator: "EXISTS" },
    ] }).attributes;
    expect(matchesSegmentAttributes({ address: { city: "Bandung" }, tier: "VIP Gold", verified: false }, filters)).toBe(true);
    expect(matchesSegmentAttributes({ address: { city: "Jakarta" }, tier: "VIP Gold", verified: true }, filters)).toBe(false);
  });

  it("rejects definitions that exceed the query complexity budget", () => {
    const definition = segmentDefinitionSchema.parse({
      tagIds: Array.from({ length: 10 }, (_, index) => `tag-${index}`),
      labelIds: Array.from({ length: 10 }, (_, index) => `label-${index}`),
    });
    expect(segmentComplexity(definition)).toBe(40);
    expect(() => assertSegmentComplexity(definition)).toThrow(/exceeds/);
  });

  it("deduplicates relationship identifiers before authorization checks", () => {
    expect(uniqueIds(["tag-a", "tag-a", "tag-b"])).toEqual(["tag-a", "tag-b"]);
  });

  it("limits contact attributes to safe scalar keys", () => {
    expect(contactProfileWriteSchema.parse({ customAttributes: { city: "Bandung", score: 10, active: true } })).toBeTruthy();
    expect(() => contactProfileWriteSchema.parse({ customAttributes: { "unsafe key": "value" } })).toThrow();
  });
});
