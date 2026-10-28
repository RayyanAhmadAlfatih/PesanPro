import { createCipheriv, randomBytes } from "node:crypto";
import { proto } from "@whiskeysockets/baileys";
import { beforeEach, describe, expect, it } from "vitest";
import { readEditedText } from "./message-event-scope";
import {
  clearMessageSecrets,
  decryptSecretMessage,
  getMessageSecret,
  messageSecretCount,
  rememberMessageSecret,
} from "./whatsapp-secret-message";

function encrypt(content: object, secret: Buffer, iv: Buffer) {
  const cipher = createCipheriv("aes-256-cbc", secret, iv);
  const plain = proto.Message.encode(proto.Message.fromObject(content)).finish();
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

describe("message secret cache", () => {
  beforeEach(() => clearMessageSecrets());

  it("returns the secret stored for a message", () => {
    const secret = randomBytes(32);
    rememberMessageSecret("qa-b-session", "ABC", secret, 1_000);
    expect(getMessageSecret("qa-b-session", "ABC", 1_100)?.equals(secret)).toBe(true);
  });

  it("keeps sessions apart", () => {
    rememberMessageSecret("qa-b-session", "ABC", randomBytes(32), 1_000);
    expect(getMessageSecret("other-session", "ABC", 1_100)).toBeNull();
  });

  it("forgets a secret after two hours", () => {
    rememberMessageSecret("qa-b-session", "ABC", randomBytes(32), 1_000);
    expect(getMessageSecret("qa-b-session", "ABC", 1_000 + 2 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("ignores empty input", () => {
    rememberMessageSecret("qa-b-session", null, randomBytes(32));
    rememberMessageSecret("qa-b-session", "ABC", null);
    expect(messageSecretCount()).toBe(0);
  });
});

describe("secret encrypted edit", () => {
  it("decrypts the new text with the target message secret", () => {
    const secret = randomBytes(32);
    const iv = randomBytes(16);
    const payload = encrypt({ conversation: "versi kedua" }, secret, iv);

    const decrypted = decryptSecretMessage(payload, iv, secret);

    expect(readEditedText(decrypted)).toBe("versi kedua");
  });

  it("returns null when the secret does not match", () => {
    const iv = randomBytes(16);
    const payload = encrypt({ conversation: "versi kedua" }, randomBytes(32), iv);

    expect(decryptSecretMessage(payload, iv, randomBytes(32))).toBeNull();
  });

  it("returns null when parts are missing", () => {
    expect(decryptSecretMessage(null, null, null)).toBeNull();
  });
});
