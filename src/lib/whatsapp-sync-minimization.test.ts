import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WhatsApp sync data minimization", () => {
  it("keeps history media metadata-only", () => {
    const source = readFileSync("src/modules/whatsapp/store/index.ts", "utf8");
    const mediaGuard = source.indexOf("if (triggerWebhook) {");
    const mediaDownload = source.indexOf("downloadAndSaveMedia(msg, sessionId)", mediaGuard);

    expect(mediaGuard).toBeGreaterThan(-1);
    expect(mediaDownload).toBeGreaterThan(mediaGuard);
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
