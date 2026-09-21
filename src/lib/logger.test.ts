import { describe, expect, it } from "vitest";
import { createStructuredLogRecord, redactLogValue } from "./logger";

describe("structured logger redaction", () => {
  it("redacts nested secret fields and token-shaped strings", () => {
    const value = redactLogValue({
      authorization: "Bearer abc.def.ghi",
      nested: { tokenHash: "should-not-leak", safe: "hello ppint_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN" },
      database: "mysql://root:supersafe@localhost:3306/pesanpro",
    });
    expect(JSON.stringify(value)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(value)).not.toContain("should-not-leak");
    expect(JSON.stringify(value)).not.toContain("supersafe");
    expect(JSON.stringify(value)).not.toContain("ppint_abcdefghijklmnopqrstuvwxyz");
    expect(value).toMatchObject({ authorization: "[REDACTED]", nested: { tokenHash: "[REDACTED]" } });
  });

  it("produces a single JSON-safe structured record", () => {
    const record = createStructuredLogRecord("info", "Queue", ["claimed", { jobId: "job-1", password: "bad" }], new Date("2026-09-05T00:00:00Z"));
    expect(record).toEqual({
      timestamp: "2026-09-05T00:00:00.000Z",
      level: "info",
      tag: "Queue",
      message: 'claimed {"jobId":"job-1","password":"[REDACTED]"}',
    });
  });
});
