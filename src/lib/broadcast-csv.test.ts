import { describe, expect, it } from "vitest";
import { MAX_BROADCAST_CSV_BYTES, parseBroadcastRecipientCsv } from "./broadcast-csv";

function chunkedStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("broadcast recipient CSV streaming import", () => {
  it("parses variables, deduplicates, and excludes groups", async () => {
    const result = await parseBroadcastRecipientCsv(chunkedStream([
      "name,pho",
      "ne,Invoice No\nAyu,628123456789,INV-001\nDuplicate,628123456789,INV-999\nGroup,120363000000@g.us,GRP\nBudi,628987654321,INV-002",
    ]));
    expect(result.recipients).toEqual(["628123456789@s.whatsapp.net", "628987654321@s.whatsapp.net"]);
    expect(result.recipientData).toEqual([
      { recipient: "628123456789@s.whatsapp.net", variables: { name: "Ayu", invoice_no: "INV-001" } },
      { recipient: "628987654321@s.whatsapp.net", variables: { name: "Budi", invoice_no: "INV-002" } },
    ]);
    expect(result.variableHeaders).toEqual(["name", "invoice_no"]);
    expect(result.rowsRead).toBe(4);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.groupsExcluded).toBe(1);
  });

  it("supports a headerless first column and quoted values", async () => {
    const result = await parseBroadcastRecipientCsv(chunkedStream(['"628111111111', '"\n"628222222222"\n']));
    expect(result.recipients).toHaveLength(2);
    expect(result.variableHeaders).toEqual([]);
  });

  it("rejects duplicate normalized headers", async () => {
    await expect(parseBroadcastRecipientCsv(chunkedStream(["phone,Invoice No,invoice-no\n628123456789,A,B"]))).rejects.toMatchObject({ code: "INVALID_RECIPIENT_CSV" });
  });

  it("rejects malformed and oversized streams", async () => {
    await expect(parseBroadcastRecipientCsv(chunkedStream(['phone\n"628123']))).rejects.toMatchObject({ code: "INVALID_RECIPIENT_CSV" });
    await expect(parseBroadcastRecipientCsv(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BROADCAST_CSV_BYTES + 1));
        controller.close();
      },
    }))).rejects.toMatchObject({ code: "INVALID_RECIPIENT_CSV" });
  });
});
