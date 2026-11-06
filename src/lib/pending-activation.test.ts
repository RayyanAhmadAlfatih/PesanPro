import { describe, expect, it } from "vitest";
import {
  activationCycleLabel,
  formatActivationAmount,
  shouldShowActivationWait,
} from "./pending-activation";

describe("gerbang halaman tunggu persetujuan", () => {
  it("menahan akun PENDING yang buktinya masih diperiksa", () => {
    expect(shouldShowActivationWait("PENDING", true)).toBe(true);
  });

  it("tidak menahan akun PENDING yang belum mengirim bukti (arahkan ke Tagihan)", () => {
    expect(shouldShowActivationWait("PENDING", false)).toBe(false);
  });

  it("tidak menahan tenant aktif yang sekadar menunggu perpanjangan disetujui", () => {
    expect(shouldShowActivationWait("STARTER", true)).toBe(false);
    expect(shouldShowActivationWait("BISNIS", true)).toBe(false);
  });

  it("tidak pernah menahan superadmin atau data yang hilang", () => {
    expect(shouldShowActivationWait("SUPERADMIN", true)).toBe(false);
    expect(shouldShowActivationWait(null, true)).toBe(false);
    expect(shouldShowActivationWait(undefined, true)).toBe(false);
  });
});

describe("label dan nominal untuk halaman tunggu", () => {
  it("menuliskan siklus seperti di layar pendaftaran", () => {
    expect(activationCycleLabel("MONTHLY")).toBe("1 bulan");
    expect(activationCycleLabel("YEARLY")).toBe("12 bulan");
    expect(activationCycleLabel("NILAI ASING")).toBe("1 bulan");
  });

  it("memformat nominal rupiah tanpa desimal", () => {
    // Intl memakai spasi tak putus (U+00A0) setelah simbol mata uang.
    const normalize = (value: string) => value.replace(/\u00A0/g, " ");
    expect(normalize(formatActivationAmount(20000))).toBe("Rp 20.000");
    expect(normalize(formatActivationAmount(490000))).toBe("Rp 490.000");
  });

  it("menandai nominal yang tidak wajar sebagai belum tersedia", () => {
    expect(formatActivationAmount(null)).toBe("Belum tersedia");
    expect(formatActivationAmount(0)).toBe("Belum tersedia");
  });
});
