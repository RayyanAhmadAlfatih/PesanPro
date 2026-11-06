import { describe, expect, it } from "vitest";
import { parseUserWhatsapp } from "./whatsapp-number";

describe("parseUserWhatsapp", () => {
  it.each([
    ["081234567890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["+62 812-3456-7890", "6281234567890"],
    ["0812 3456 7890", "6281234567890"],
    ["8123456789", "628123456789"],
    ["0812345678", "62812345678"],
  ])("menerima format Indonesia yang umum: %s -> %s", (raw, expected) => {
    const parsed = parseUserWhatsapp(raw);
    expect(parsed).toEqual({ ok: true, normalized: expected, display: expect.any(String) });
  });

  it("menolak nomor kosong dengan pesan yang jelas", () => {
    expect(parseUserWhatsapp("")).toMatchObject({ ok: false });
    expect(parseUserWhatsapp("   ")).toMatchObject({ ok: false });
    expect(parseUserWhatsapp(null)).toMatchObject({ ok: false });
  });

  it("menolak huruf", () => {
    const parsed = parseUserWhatsapp("0812abcd890");
    expect(parsed).toMatchObject({ ok: false });
    expect(parsed.ok ? "" : parsed.reason).toContain("angka");
  });

  it("menolak nomor yang terlalu pendek", () => {
    expect(parseUserWhatsapp("0812345").ok).toBe(false);
  });

  it("menolak nomor yang terlalu panjang", () => {
    expect(parseUserWhatsapp("081234567890123456").ok).toBe(false);
  });

  it("menolak prefix bukan seluler Indonesia (landline 021…)", () => {
    expect(parseUserWhatsapp("0213456789").ok).toBe(false);
  });
});
