import { describe, expect, it } from "vitest";
import { campaignResultsCsv } from "./campaign-csv";

describe("campaign CSV export", () => {
  it("escapes quotes and neutralizes spreadsheet formulas", () => {
    const csv = campaignResultsCsv([{ recipient: "=HYPERLINK(\"bad\")", snapshotStatus: "HANDED_OFF", queueStatus: "SENT", messageStatus: "READ", errorCode: null }]);
    expect(csv).toContain("'=HYPERLINK(\"\"bad\"\")");
    expect(csv).not.toContain('\r\n"=HYPERLINK');
  });
});
