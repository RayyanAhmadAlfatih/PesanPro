import { prisma } from "@/lib/prisma";
import { getSocketServer } from "@/lib/socket-server";
import { logger } from "@/lib/logger";

/**
 * In-app alerts for WhatsApp sessions that stopped working on their own.
 *
 * Before this, a session could flip to LOGGED_OUT or STOPPED and the tenant
 * only found out when a send failed with 503. The bell notification and the
 * realtime toast are the channels the dashboard already listens to.
 */
export type SessionAlertKind = "LOGGED_OUT" | "STOPPED" | "RECONNECT_FAILED" | "FAILED";

const ALERT_COPY: Record<SessionAlertKind, { title: string; message: (name: string) => string }> = {
  LOGGED_OUT: {
    title: "Sesi WhatsApp terputus",
    message: (name) =>
      `Sesi "${name}" keluar dari akun WhatsApp. Pesan tidak bisa dikirim atau diterima sampai Anda menghubungkan ulang lewat QR di halaman Sesi.`,
  },
  STOPPED: {
    title: "Sesi WhatsApp berhenti",
    message: (name) =>
      `Sesi "${name}" dihentikan setelah beberapa kali gagal terhubung ulang. Periksa koneksi server, lalu mulai sesi kembali dari halaman Sesi.`,
  },
  RECONNECT_FAILED: {
    title: "Sesi WhatsApp gagal dipulihkan",
    message: (name) =>
      `Sesi "${name}" tidak bisa dipulihkan otomatis setelah koneksinya bermasalah. Mulai sesi kembali dari halaman Sesi.`,
  },
  FAILED: {
    title: "Sesi WhatsApp tidak aktif",
    message: (name) =>
      `Sesi "${name}" berhenti karena gangguan teknis dan pemulihan otomatis belum berhasil. Mulai sesi kembali dari halaman Sesi.`,
  },
};

export async function notifySessionOwner(input: {
  userId: string;
  sessionId: string;
  kind: SessionAlertKind;
}) {
  const copy = ALERT_COPY[input.kind];
  const href = "/dashboard/sessions";

  try {
    const session = await prisma.session.findUnique({
      where: { sessionId: input.sessionId },
      select: { name: true },
    });
    const name = session?.name?.trim() || input.sessionId;

    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        title: copy.title,
        message: copy.message(name),
        type: "WARNING",
        href,
      },
    });

    getSocketServer()?.to(`user:${input.userId}`).emit("notification:new", {
      id: notification.id,
      userId: input.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      href: notification.href,
      createdAt: notification.createdAt,
      read: false,
    });

    return notification;
  } catch (error) {
    // Alerting must never break the session lifecycle it is reporting on.
    logger.error("SessionAlert", `Failed to notify owner of session ${input.sessionId} (${input.kind})`, error);
    return null;
  }
}
