/**
 * Keeps the process from growing without bound.
 *
 * The runtime holds a WhatsApp connection, the Prisma pool, Socket.IO rooms and
 * six workers in one Node process. In production that process has been seen to
 * grow from tens of megabytes to well over a gigabyte within a day, at which
 * point garbage collection dominates the CPU and every request queues behind it
 * (a page that normally answers in 150 ms took 17 s).
 *
 * PM2 has `max_memory_restart`, but it did not fire during that incident, so the
 * process checks itself instead. When RSS stays above the limit for consecutive
 * checks it shuts down through the normal graceful path; the supervisor
 * (PM2 `autorestart`) starts a fresh process.
 *
 * Two consecutive breaches are required so a short spike — a big broadcast, a
 * media upload — never restarts a healthy process.
 */

export type MemoryWatchdogLogger = {
  warn: (tag: string, message: string) => void;
  error?: (tag: string, message: string, error?: unknown) => void;
};

export type MemoryWatchdogOptions = {
  limitBytes: number;
  intervalMs?: number;
  /** Consecutive checks above the limit before acting. Defaults to 2. */
  breachesToTrigger?: number;
  readRssBytes?: () => number;
  onExceed: (info: { rssBytes: number; limitBytes: number }) => void | Promise<void>;
  logger?: MemoryWatchdogLogger;
};

export type MemoryWatchdog = {
  /** Runs one check immediately. Returns true when it triggered the shutdown. */
  check: () => Promise<boolean>;
  stop: () => void;
};

export function startMemoryWatchdog(options: MemoryWatchdogOptions): MemoryWatchdog {
  const intervalMs = Math.max(1_000, options.intervalMs ?? 30_000);
  const breachesToTrigger = Math.max(1, options.breachesToTrigger ?? 2);
  const readRss = options.readRssBytes ?? (() => process.memoryUsage().rss);
  let breaches = 0;
  let triggered = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const check = async () => {
    if (triggered) return false;
    const rssBytes = readRss();
    if (rssBytes < options.limitBytes) {
      breaches = 0;
      return false;
    }
    breaches += 1;
    if (breaches < breachesToTrigger) return false;

    triggered = true;
    options.logger?.warn(
      "MemoryWatchdog",
      `RSS ${toMegabytes(rssBytes)} MB is above the ${toMegabytes(options.limitBytes)} MB limit for ${breaches} checks; shutting down so the supervisor restarts a clean process`,
    );
    try {
      await options.onExceed({ rssBytes, limitBytes: options.limitBytes });
    } catch (error) {
      // The shutdown path failed. Allow the next check to try again rather than
      // leaving a process that is both over the limit and doing nothing.
      triggered = false;
      breaches = 0;
      options.logger?.error?.("MemoryWatchdog", "Memory shutdown failed", error);
    }
    return true;
  };

  timer = setInterval(() => {
    void check();
  }, intervalMs);
  timer.unref?.();

  return {
    check,
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

function toMegabytes(bytes: number) {
  return Math.round(bytes / 1024 / 1024);
}
