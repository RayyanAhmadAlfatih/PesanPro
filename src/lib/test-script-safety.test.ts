import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("manual test script safety", () => {
  it("does not ship the former hard-coded superadmin credentials or production test target", async () => {
    const files = await Promise.all([
      readFile("scripts/setup-test-user.ts", "utf8"),
      readFile("scripts/test_endpoints.sh", "utf8"),
    ]);
    const source = files.join("\n");
    expect(source).not.toContain("wag_TESTAPIKEY123");
    expect(source).not.toContain("password123");
    expect(source).not.toContain("https://wagateway.kingofcoding.my.id/api");
    expect(source).not.toMatch(/Using API Key:\s*\$API_KEY/);
  });
});
