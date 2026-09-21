import { describe, expect, it } from "vitest";
import { MessageJobError } from "./message-job-errors";
import { applyIntegrationMapping, hashIntegrationToken, readIntegrationToken } from "./integration-contract";

describe("integration token and mapping contract", () => {
  const token = `ppint_${"a".repeat(43)}`;

  it("accepts a connector token from the dedicated header or bearer header", () => {
    expect(readIntegrationToken(new Headers({ "x-integration-token": token }))).toBe(token);
    expect(readIntegrationToken(new Headers({ authorization: `Bearer ${token}` }))).toBe(token);
  });

  it("rejects API keys and malformed connector credentials", () => {
    expect(() => readIntegrationToken(new Headers({ "x-integration-token": "wag_not_a_connector_token" }))).toThrow(MessageJobError);
    expect(() => readIntegrationToken(new Headers())).toThrowError(expect.objectContaining({ code: "INVALID_INTEGRATION_TOKEN" }));
  });

  it("hashes connector secrets without retaining the plaintext", () => {
    const hash = hashIntegrationToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("applies bounded templates and static recipient mapping", () => {
    expect(applyIntegrationMapping(
      { staticRecipient: "628111111111", messageTemplate: "Order {{sourceId}} {{event}}: {{message}}" },
      { recipient: "628000000000", sourceId: "42", message: "paid", metadata: { event: "order.paid" } },
    )).toEqual({ recipient: "628111111111", sourceId: "42", message: "Order 42 order.paid: paid", metadata: { event: "order.paid" } });
  });

  it("rejects an empty or oversized mapped message", () => {
    expect(() => applyIntegrationMapping({ messageTemplate: "{{missing}}" }, { recipient: "628111111111", sourceId: "1", message: "ok" })).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE" }));
    expect(() => applyIntegrationMapping({ messageTemplate: "x".repeat(4097) }, { recipient: "628111111111", sourceId: "1", message: "ok" })).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE" }));
  });
});
