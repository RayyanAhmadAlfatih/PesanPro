import { describe, expect, it } from "vitest";

// Fase 0 #5: { message: "text" } was rejected with 400 while { message: { text } }
// worked. Both shapes must now mean the same thing.
import { getOutgoingMessageText, parseOutgoingMessage } from "./whatsapp-message";

describe("parseOutgoingMessage", () => {
  it("accepts a plain string as message text", () => {
    const message = parseOutgoingMessage("Halo dari uji format");

    expect(message).toEqual({ text: "Halo dari uji format" });
    expect(getOutgoingMessageText(message!)).toBe("Halo dari uji format");
  });

  it("keeps the existing object shape working", () => {
    const message = parseOutgoingMessage({ text: "Halo" });

    expect(message).toEqual({ text: "Halo" });
    expect(getOutgoingMessageText(message!)).toBe("Halo");
  });

  it("attaches mentions to both shapes", () => {
    expect(parseOutgoingMessage("Halo", ["628111@s.whatsapp.net"]))
      .toEqual({ text: "Halo", mentions: ["628111@s.whatsapp.net"] });
    expect(parseOutgoingMessage({ text: "Halo" }, ["628111@s.whatsapp.net"]))
      .toEqual({ text: "Halo", mentions: ["628111@s.whatsapp.net"] });
  });

  it("rejects empty and malformed input", () => {
    expect(parseOutgoingMessage("")).toBeNull();
    expect(parseOutgoingMessage("   ")).toBeNull();
    expect(parseOutgoingMessage({})).toBeNull();
    expect(parseOutgoingMessage(null)).toBeNull();
    expect(parseOutgoingMessage(undefined)).toBeNull();
    expect(parseOutgoingMessage(42)).toBeNull();
  });

  it("ignores a malformed mentions value instead of failing the message", () => {
    expect(parseOutgoingMessage("Halo", ["ok", 42])).toEqual({ text: "Halo" });
    expect(parseOutgoingMessage({ text: "Halo" }, "not-an-array")).toEqual({ text: "Halo" });
  });
});
