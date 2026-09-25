import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public HTML cache policy", () => {
  it.each([
    "src/app/page.tsx",
    "src/app/auth/layout.tsx",
  ])("keeps %s out of the deployment-sensitive Full Route Cache", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("export const revalidate = 0");
  });
});
