import { describe, expect, it } from "vitest";
import { parseSpintax, previewSpintax, renderSpintax } from "./spintax";

describe("safe deterministic spintax", () => {
  it("parses nested choices and counts combinations", () => {
    const parsed = parseSpintax("{Halo|Hai {kak|teman}}, {pagi|siang}!");
    expect(parsed.combinations).toBe(6);
  });

  it("supports escaped syntax characters", () => {
    const parsed = parseSpintax("Gunakan \\{kode\\} atau {A\\|B|C}");
    expect(parsed.combinations).toBe(2);
    expect(renderSpintax(parsed, "seed", "recipient")).toMatch(/^Gunakan \{kode\} atau (A\|B|C)$/);
  });

  it("renders the same recipient identically across retries and restarts", () => {
    const parsed = parseSpintax("{Halo|Hai|Hi} {kak|teman}");
    const first = renderSpintax(parsed, "broadcast-seed", "recipient-1");
    expect(renderSpintax(parsed, "broadcast-seed", "recipient-1")).toBe(first);
    expect(renderSpintax(parseSpintax(parsed.source), "broadcast-seed", "recipient-1")).toBe(first);
  });

  it("rejects malformed, excessively nested, and explosive input", () => {
    expect(() => parseSpintax("{one|two")).toThrow("closing brace");
    expect(() => parseSpintax("{one}")).toThrow("at least two");
    expect(() => parseSpintax("{{{{{{a|b}|c}|d}|e}|f}|g}")).toThrow("nesting");
    const choices = Array.from({ length: 5 }, () => "{a|b|c|d|e|f|g|h|i|j}").join("");
    expect(() => parseSpintax(choices)).toThrow("10000 combinations");
  });

  it("returns bounded previews", () => {
    const result = previewSpintax("{A|B} {1|2}", 1000);
    expect(result.combinations).toBe(4);
    expect(result.samples).toHaveLength(4);
  });

  it("round-trips a deterministic basic fuzz corpus without executing input", () => {
    let state = 0x5eed1234;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    for (let index = 0; index < 300; index += 1) {
      const optionCount = 2 + (random() % 5);
      const suffixCount = 2 + (random() % 4);
      const source = `prefix-${index} {${Array.from({ length: optionCount }, (_, option) => `a${option}`).join("|")}} {${Array.from({ length: suffixCount }, (_, option) => `b${option}`).join("|")}}`;
      const parsed = parseSpintax(source);
      const first = renderSpintax(parsed, "fuzz-seed", `recipient-${random()}`);
      expect(first).toBe(renderSpintax(parseSpintax(source), "fuzz-seed", `recipient-${state}`));
      expect(first.length).toBeLessThanOrEqual(4096);
    }
  });
});
