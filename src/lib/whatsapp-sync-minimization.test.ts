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

  it("never asks WhatsApp for a full history sync", () => {
    // A full-history request streams the entire chat archive of the linked
    // number through memory on connect. It contradicts the public "no old
    // chat history" promise and caused the 2026-10-17 OOM loop (~1.1M
    // messages synced in one storm). Recent messages, chats, and contacts
    // still arrive normally without it.
    const instance = readFileSync("src/modules/whatsapp/instance.ts", "utf8");

    expect(instance).toContain("syncFullHistory: false");
    expect(instance).not.toContain("syncFullHistory: true");
  });

  it("publishes message.edited for both edit envelopes", () => {
    // Baileys delivers an edit either on the update stream
    // (update.message.editedMessage) or already unwrapped in the upsert
    // (msg.message.editedMessage). Missing the second path meant a real edit
    // produced no webhook at all.
    const store = readFileSync("src/modules/whatsapp/store/index.ts", "utf8");

    expect(store).toContain("unwrappedEdit?.message");
    expect(store).toContain("Edit received on upsert");
    expect(store).toContain("Edit received on update stream");
    // A missing jid must not drop a legitimate edit.
    expect(store).toContain("remoteJid && !isTenantChatJid(remoteJid)");
  });

  it("publishes protocol edits and revokes on every stream", () => {
    // Edits made from the linked phone arrive on the append stream, where the
    // old code skipped the webhook entirely because it only published on
    // notify. Protocol events are not new messages, so they always publish.
    const store = readFileSync("src/modules/whatsapp/store/index.ts", "utf8");

    expect(store).toContain("Edit received on protocol message");
    expect(store).toContain("Delete received on protocol message");
    expect(store).toContain("Protocol message type=");
  });
});
