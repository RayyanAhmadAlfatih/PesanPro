import { describe, expect, it } from "vitest";
import { subscriptionStatusView } from "./billing-status";

describe("subscription status view (shared by Tagihan and Ringkasan)", () => {
  it("labels a pending plan as not yet active", () => {
    const view = subscriptionStatusView({ status: "ACTIVE", plan: { code: "PENDING", name: "Starter" } });
    expect(view.label).toBe("Belum aktif");
  });

  it("labels an active paid plan as active", () => {
    const view = subscriptionStatusView({ status: "ACTIVE", plan: { code: "BISNIS", name: "Bisnis" } });
    expect(view.label).toBe("Aktif");
  });

  it("labels grace, expired, suspended, and cancelled states distinctly", () => {
    const plan = { code: "BISNIS", name: "Bisnis" };
    expect(subscriptionStatusView({ status: "GRACE_PERIOD", plan }).label).toBe("Masa tenggang");
    expect(subscriptionStatusView({ status: "EXPIRED", plan }).label).toBe("Kedaluwarsa");
    expect(subscriptionStatusView({ status: "SUSPENDED", plan }).label).toBe("Ditangguhkan");
    expect(subscriptionStatusView({ status: "CANCELLED", plan }).label).toBe("Dibatalkan");
  });

  it("handles a missing billing snapshot", () => {
    expect(subscriptionStatusView(null).label).toBe("Belum ada data");
  });
});
