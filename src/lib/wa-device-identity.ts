import { Browsers } from "@whiskeysockets/baileys";
import { createHash } from "node:crypto";

/**
 * The WhatsApp Web device identity a session presents.
 *
 * Hardcoding a single value makes every PesanPro session in the world look
 * identical, which is a product-level fingerprint — and the previous constant
 * ("20.0.04") is not even a real Ubuntu release, which is its own tell.
 *
 * Deriving the identity from the session id keeps it stable across reconnects
 * (a device that changes identity on every connect is suspicious in its own
 * right) while differing between sessions. Values come from Baileys' own
 * helper so they stay plausible; `Browsers.baileys()` is deliberately not used
 * because it advertises the library.
 */
export function browserIdentity(sessionId: string): [string, string, string] {
  const candidates: Array<[string, string, string]> = [
    Browsers.macOS("Desktop"),
    Browsers.macOS("Chrome"),
    Browsers.windows("Chrome"),
    Browsers.ubuntu("Chrome"),
  ];
  const digest = createHash("sha256").update(sessionId).digest();
  return candidates[digest[0] % candidates.length];
}
