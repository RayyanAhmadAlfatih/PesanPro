import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonicalJson } from "./canonical-json";

describe("canonical request hashing", () => {
  it("sorts nested object keys while retaining array order", () => {
    const first = { z: 2, nested: { b: true, a: "x" }, values: [3, 1] };
    const second = { values: [3, 1], nested: { a: "x", b: true }, z: 2 };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(hashCanonicalJson(first)).toBe(hashCanonicalJson(second));
  });

  it("produces a different hash for a materially different payload", () => {
    expect(hashCanonicalJson({ text: "one" })).not.toBe(hashCanonicalJson({ text: "two" }));
  });
});
