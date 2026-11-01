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
  return role === "USER" || role === "SUPERADMIN";
}

export function isWithinDeviceLimit(role: Role, currentCount: number, deviceLimit: number): boolean {
  return canCreateDevice(role) && currentCount < deviceLimit;
}

export function canPerformDeviceAction(role: Role, isOwner: boolean, action: string): boolean {
  return canCreateDevice(role)
    && isOwner
    && ["pair", "start", "stop", "restart", "logout", "delete"].includes(action);
}

export function shouldRecoverDevice(status: DeviceStatus, hasCredentials: boolean): boolean {
  if (!hasCredentials) return false;
  return ["CONNECTED", "CONNECTING", "RECONNECTING", "DISCONNECTED"].includes(status);
}

/**
 * QR and pairing codes live in memory. After a restart the stored status is a
 * dead end: the QR shown in the dashboard is stale, the Start button is
 * disabled for QR_REQUIRED/PAIRING_REQUIRED, and no instance exists to emit a
 * fresh code. These states are reset to STOPPED on startup so the owner can
 * press Start and get a valid code.
 */
export const EPHEMERAL_PAIRING_STATUSES: DeviceStatus[] = ["QR_REQUIRED", "PAIRING_REQUIRED"];

export type DeviceActionFailure = { status: number; message: string };

/**
 * Turn a runtime error from a device action into a message the owner can act
 * on. The route used to return one generic sentence for every failure, so the
 * most common causes (another worker holds the session, the session was never
 * started) looked identical and produced support tickets.
 */
export function describeDeviceActionFailure(error: unknown): DeviceActionFailure {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("already active on another worker")) {
    return { status: 409, message: "Perangkat sedang dipakai proses lain. Tunggu sebentar, lalu coba lagi." };
  }
  if (message.includes("Instance not found or not running")) {
    return { status: 409, message: "Sesi belum berjalan. Tekan Start dulu, lalu minta kode pairing." };
  }
  if (message.includes("Socket not initialized")) {
    return { status: 503, message: "Koneksi WhatsApp belum siap. Tunggu beberapa detik, lalu coba lagi." };
  }
  if (message.includes("Session not found")) {
    return { status: 404, message: "Perangkat tidak ditemukan. Muat ulang halaman ini." };
  }
  if (message.includes("Phone number must")) {
    return { status: 422, message: "Nomor telepon belum valid. Tulis nomor dengan kode negara, contoh 6281234567890." };
  }
  return { status: 500, message: "Perangkat gagal dijalankan. Coba lagi. Kalau tetap gagal, hubungi admin." };
}
