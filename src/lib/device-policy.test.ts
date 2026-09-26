import { describe, expect, it } from "vitest";
import {
  canCreateDevice,
  canPerformDeviceAction,
  isWithinDeviceLimit,
  shouldRecoverDevice,
} from "./device-policy";

describe("device policy", () => {
  it("allows customer and superadmin accounts to create their own devices", () => {
    expect(canCreateDevice("USER")).toBe(true);
    expect(canCreateDevice("SUPERADMIN")).toBe(true);
  });

  it("recovers interrupted devices but always respects STOPPED and LOGGED_OUT", () => {
    expect(shouldRecoverDevice("CONNECTED", true)).toBe(true);
    expect(shouldRecoverDevice("RECONNECTING", true)).toBe(true);
    expect(shouldRecoverDevice("STOPPED", true)).toBe(false);
    expect(shouldRecoverDevice("LOGGED_OUT", true)).toBe(false);
    expect(shouldRecoverDevice("CONNECTED", false)).toBe(false);
  });

  it("applies device limits to both account roles", () => {
    expect(isWithinDeviceLimit("USER", 0, 1)).toBe(true);
    expect(isWithinDeviceLimit("USER", 1, 1)).toBe(false);
    expect(isWithinDeviceLimit("SUPERADMIN", 0, 1)).toBe(true);
    expect(isWithinDeviceLimit("SUPERADMIN", 1, 1)).toBe(false);
  });

  it("reserves pairing, logout, and deletion for the device owner", () => {
    expect(canPerformDeviceAction("USER", false, "start")).toBe(false);
    expect(canPerformDeviceAction("USER", true, "start")).toBe(true);
    expect(canPerformDeviceAction("USER", true, "logout")).toBe(true);
    expect(canPerformDeviceAction("USER", false, "logout")).toBe(false);
    expect(canPerformDeviceAction("SUPERADMIN", true, "delete")).toBe(true);
    expect(canPerformDeviceAction("SUPERADMIN", false, "delete")).toBe(false);
  });
});
