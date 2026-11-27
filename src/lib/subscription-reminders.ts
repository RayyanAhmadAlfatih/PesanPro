import { deriveSubscriptionStatus } from "./billing";
import { getEnv } from "./env";
import { queueSubscriptionReminderEmails, type SubscriptionReminderStage } from "./email-notifications";
import { prisma } from "./prisma";

/**
 * Pengingat paket berakhir H-3 dan H-1. Dipanggil berkala dari runtime, jadi
 * setiap keputusan di sini harus murni fungsi dari data + jam: pemindaian yang
 * berjalan dua kali di tanggal yang sama tidak boleh menghasilkan dua email.
 * Idempotensinya sendiri dijaga `eventKey` unik di EmailOutbox.
 */

/**
 * Jendela kirim dipilih supaya pengingat tidak masuk tengah malam. Di luar
 * jendela ini pemindaian berhenti sebelum menyentuh database.
 */
const SEND_WINDOW_START_HOUR = 9;
const SEND_WINDOW_END_HOUR = 20;

/** Batas atas pencarian: paket paling jauh 4 hari lagi (H-1 dan H-3 + jeda zona waktu). */
const LOOKAHEAD_DAYS = 5;

const DAY_MS = 86_400_000;

function calendarParts(value: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour") };
}

/** `YYYY-MM-DD` menurut zona waktu aplikasi, bukan UTC. */
export function reminderDateKey(value: Date, tz: string = getEnv().TZ): string {
  const { year, month, day } = calendarParts(value, tz);
  return `${year}-${month}-${day}`;
}

function dayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** Selisih tanggal kalender (bukan selisih jam) antara hari ini dan tanggal berakhir. */
function daysUntilDate(endsAt: Date, now: Date, tz: string = getEnv().TZ) {
  return dayNumber(reminderDateKey(endsAt, tz)) - dayNumber(reminderDateKey(now, tz));
}

/**
 * `h3` dan `h1` bila tanggal berakhir tepat 3 atau 1 hari lagi, selain itu null.
 * Paket yang sudah lewat tenggat tidak pernah dapat pengingat: itu urusan admin,
 * bukan sesuatu yang bisa diselesaikan pengingat.
 */
export function reminderStageFor(
  endsAt: Date,
  now: Date,
  tz: string = getEnv().TZ,
): SubscriptionReminderStage | null {
  const days = daysUntilDate(endsAt, now, tz);
  if (days === 3) return "h3";
  if (days === 1) return "h1";
  return null;
}

/** Pengingat hanya dikirim pada jam yang wajar di zona waktu aplikasi. */
export function isReminderSendWindow(now: Date, tz: string = getEnv().TZ) {
  const hour = Number(calendarParts(now, tz).hour);
  return Number.isFinite(hour) && hour >= SEND_WINDOW_START_HOUR && hour <= SEND_WINDOW_END_HOUR;
}

/**
 * Semua baris yang tanggal berakhirnya berada dalam jangkauan pengingat. Batas
 * bawahnya cukup `now`: paket yang sudah lewat tenggat bukan langganan aktif.
 */
function reminderSearchDeadline(now: Date, tz: string) {
  const { year, month, day } = calendarParts(now, tz);
  const startOfToday = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return new Date(startOfToday + LOOKAHEAD_DAYS * DAY_MS);
}

/**
 * Satu putaran pengingat. Mengembalikan jumlah email yang benar-benar masuk
 * antrean (0 bila di luar jendela kirim, tidak ada kandidat, atau semua sudah
 * pernah dikirim sebelumnya).
 */
export async function runSubscriptionReminders(now: Date = new Date(), tz: string = getEnv().TZ) {
  if (!isReminderSendWindow(now, tz)) return 0;

  const range = reminderSearchDeadline(now, tz);
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { gt: now, lte: range },
      user: { role: "USER", status: "ACTIVE" },
    },
    select: {
      userId: true,
      status: true,
      trialEndsAt: true,
      endsAt: true,
      graceEndsAt: true,
      plan: { select: { name: true } },
    },
    orderBy: { endsAt: "asc" },
  });
  if (subscriptions.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: { id: { in: subscriptions.map((item) => item.userId) } },
    select: { id: true, name: true, email: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  // Satu query untuk semua kandidat: hindari N+1 saat jumlah tenant bertambah.
  const pendingVerifications = await prisma.paymentVerification.findMany({
    where: {
      userId: { in: subscriptions.map((item) => item.userId) },
      status: "PENDING",
    },
    select: {
      userId: true,
      amount: true,
      currency: true,
      reference: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const pendingByUser = new Map<string, (typeof pendingVerifications)[number]>();
  for (const verification of pendingVerifications) {
    if (!pendingByUser.has(verification.userId)) pendingByUser.set(verification.userId, verification);
  }

  let queued = 0;
  for (const subscription of subscriptions) {
    if (!subscription.endsAt) continue;
    // Akun PENDING belum pernah aktif; status turunan yang bukan ACTIVE juga
    // dilewati supaya pengingat tidak dikirim ke paket yang sudah ditangguhkan.
    if (deriveSubscriptionStatus(subscription, now) !== "ACTIVE") continue;
    const stage = reminderStageFor(subscription.endsAt, now, tz);
    if (!stage) continue;
    const user = usersById.get(subscription.userId);
    if (!user) continue;

    const pending = pendingByUser.get(subscription.userId) ?? null;
    queued += await queueSubscriptionReminderEmails(prisma, {
      userId: subscription.userId,
      userName: user.name,
      userEmail: user.email,
      planName: subscription.plan.name,
      endsAt: subscription.endsAt,
      stage,
      pending: pending
        ? {
          amount: pending.amount.toString(),
          currency: pending.currency,
          reference: pending.reference ?? "-",
          submittedAt: pending.createdAt,
        }
        : null,
    }, reminderDateKey(subscription.endsAt, tz));
  }
  return queued;
}
