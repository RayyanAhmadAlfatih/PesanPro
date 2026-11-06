import { describe, expect, it } from "vitest";
import { evaluatePaymentMethods, serializePaymentMethodsForPublic } from "./payment-methods";

const base = {
  manualEnabled: true,
  midtransEnabled: false,
  activeManualAccountCount: 1,
  midtransKeysConfigured: false,
  activeMidtransMethodCount: 0,
};

describe("evaluatePaymentMethods — matriks saklar F1.4", () => {
  it("Manual saja AKTIF dengan rekening: hanya Manual yang siap", () => {
    const snapshot = evaluatePaymentMethods(base);
    expect(snapshot.manual.ready).toBe(true);
    expect(snapshot.midtrans.ready).toBe(false);
    expect(snapshot.anyReady).toBe(true);
  });

  it("Manual AKTIF tetapi nol rekening aktif: Manual tidak siap, peringatan menyebut rekening", () => {
    const snapshot = evaluatePaymentMethods({ ...base, activeManualAccountCount: 0 });
    expect(snapshot.manual.ready).toBe(false);
    expect(snapshot.manual.missing.join(" ")).toContain("rekening aktif");
    expect(snapshot.anyReady).toBe(false);
  });

  it("Midtrans AKTIF tanpa kunci/metode (kondisi Fase 1): tidak siap, tidak tampil ke user", () => {
    const snapshot = evaluatePaymentMethods({ ...base, midtransEnabled: true });
    expect(snapshot.midtrans.enabled).toBe(true);
    expect(snapshot.midtrans.ready).toBe(false);
    expect(snapshot.midtrans.missing.join(" ")).toContain("Kunci Midtrans");
    expect(snapshot.anyReady).toBe(true); // Manual tetap siap
  });

  it("Keduanya AKTIF: keduanya bisa siap sekaligus", () => {
    const snapshot = evaluatePaymentMethods({
      ...base,
      midtransEnabled: true,
      midtransKeysConfigured: true,
      activeMidtransMethodCount: 2,
    });
    expect(snapshot.manual.ready).toBe(true);
    expect(snapshot.midtrans.ready).toBe(true);
    expect(snapshot.anyReady).toBe(true);
  });

  it("Keduanya NONAKTIF: checkout terblokir (anyReady false)", () => {
    const snapshot = evaluatePaymentMethods({ ...base, manualEnabled: false });
    expect(snapshot.anyReady).toBe(false);
  });

  it("Midtrans siap menuntut kunci DAN metode, bukan salah satu", () => {
    const keysOnly = evaluatePaymentMethods({ ...base, midtransEnabled: true, midtransKeysConfigured: true });
    const methodsOnly = evaluatePaymentMethods({ ...base, midtransEnabled: true, activeMidtransMethodCount: 3 });
    expect(keysOnly.midtrans.ready).toBe(false);
    expect(methodsOnly.midtrans.ready).toBe(false);
  });
});

describe("serializePaymentMethodsForPublic", () => {
  it("tidak membocorkan daftar `missing` ke payload publik", () => {
    const snapshot = evaluatePaymentMethods({ ...base, activeManualAccountCount: 0 });
    const serialized = serializePaymentMethodsForPublic(snapshot);
    expect(JSON.stringify(serialized)).not.toContain("missing");
    expect(serialized.manual.ready).toBe(false);
  });
});
