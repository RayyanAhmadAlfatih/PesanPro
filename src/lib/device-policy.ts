import type { DeviceStatus, Role } from "@prisma/client";

export class DeviceLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Device limit of ${limit} reached`);
    this.name = "DeviceLimitError";
  }
}

export class DevicePermissionError extends Error {
  constructor(message = "This role cannot create or manage devices") {
    super(message);
    this.name = "DevicePermissionError";
  }
}

export function canCreateDevice(role: Role): boolean {
  return role === "USER";
}

export function isWithinDeviceLimit(role: Role, currentCount: number, deviceLimit: number): boolean {
  return role === "USER" && currentCount < deviceLimit;
}

export function canPerformDeviceAction(role: Role, isOwner: boolean, action: string): boolean {
  return role === "USER"
    && isOwner
    && ["pair", "start", "stop", "restart", "logout", "delete"].includes(action);
}

export function shouldRecoverDevice(status: DeviceStatus, hasCredentials: boolean): boolean {
  if (!hasCredentials) return false;
  return ["CONNECTED", "CONNECTING", "RECONNECTING", "DISCONNECTED"].includes(status);
}
