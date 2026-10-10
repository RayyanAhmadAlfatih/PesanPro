import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WhatsApp sync data minimization", () => {
  it("never persists WhatsApp message text", () => {
    const store = readFileSync("src/modules/whatsapp/store/index.ts", "utf8");

    expect(store).not.toContain("content: text");
    expect(store).not.toContain("savedMessage.content");
    expect(store).not.toContain("antiDelete");
    expect(existsSync("src/app/api/messages/[sessionId]/search/route.ts")).toBe(false);
    expect(existsSync("src/modules/whatsapp/chat.service.ts")).toBe(false);
  });

  it("never downloads or persists WhatsApp message media", () => {
    const store = readFileSync("src/modules/whatsapp/store/index.ts", "utf8");
    const webhook = readFileSync("src/lib/webhook.ts", "utf8");

    expect(store).not.toContain("downloadAndSaveMedia");
    expect(store).toContain("mediaUrl: null");
    expect(webhook).not.toContain("downloadAndSaveMedia");
    expect(webhook).not.toContain('"data", "media"');
  });

  it("does not import the complete address book", () => {
    const source = readFileSync("src/modules/whatsapp/store/contacts.ts", "utf8");

    expect(source).not.toContain("for (const contact of contacts)");
    expect(source).toContain("skipped ${contacts?.length || 0} address-book contacts");
  });

  it("enriches existing contacts instead of creating address-book records", () => {
    const source = readFileSync("src/modules/whatsapp/store/index.ts", "utf8");
    const handlerStart = source.indexOf("sock.ev.on('contacts.upsert'");
    const handlerEnd = source.indexOf("// Handle Message Status Updates", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handler).toContain("prisma.contact.updateMany");
    expect(handler).not.toContain("prisma.contact.upsert");
  });
});
