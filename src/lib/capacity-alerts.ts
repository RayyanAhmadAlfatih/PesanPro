import os from "node:os";
import {
  evaluateCapacity,
  parseCapacityLimits,
  type CapacityUsageInput,
} from "./capacity";
import { queueCapacityAlertEmails } from "./email-notifications";
import { collectOperationalSnapshot } from "./operations";
import { prisma } from "./prisma";

const ALERT_THRESHOLD_PERCENT = 80;

/**
 * Dipanggil pemindaian operasional tiap menit. Email dibatasi satu per jam
 * lewat `eventKey`, jadi pemindaian yang sering tidak membanjiri admin.
 */
export async function maybeQueueCapacityAlert(input: {
  snapshot: Awaited<ReturnType<typeof collectOperationalSnapshot>>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [config, payingTenants] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: "default" }, select: { capacityLimits: true } }),
    prisma.subscription.count({
      where: { status: { in: ["TRIAL", "ACTIVE", "GRACE_PERIOD"] }, plan: { priceMonthly: { gt: 0 } } },
    }),
  ]);
  const disk = input.snapshot.resources.disks.reduce<typeof input.snapshot.resources.disks[number] | null>(
    (best, item) => (!best || item.usePercent > best.usePercent ? item : best),
    null,
  );
  const live: CapacityUsageInput = {
    cpuCores: os.cpus().length,
    cpuPercent: input.snapshot.resources.cpuPercent,
    ramTotalBytes: input.snapshot.resources.memory.totalBytes,
    ramUsedBytes: input.snapshot.resources.memory.usedBytes,
    diskTotalBytes: disk?.sizeBytes ?? "0",
    diskUsedBytes: disk?.usedBytes ?? "0",
    diskUsePercent: disk?.usePercent ?? 0,
    waSessions: input.snapshot.business.devices.total,
    monthlyMessages: input.snapshot.business.sentMessages,
    tenants: payingTenants,
  };
  const report = evaluateCapacity(live, parseCapacityLimits(config?.capacityLimits));
  if (report.statusPercent < ALERT_THRESHOLD_PERCENT) return 0;
  return queueCapacityAlertEmails(prisma, {
    statusPercent: report.statusPercent,
    remainingTenants: report.remainingTenants,
    fullest: report.fullest,
    fullestResource: report.fullestResource,
    bounds: report.bounds.map((bound) => ({
      label: bound.label,
      usePercent: bound.usePercent,
      remainingTenants: bound.remainingTenants,
    })),
    generatedAt: now,
  });
}
