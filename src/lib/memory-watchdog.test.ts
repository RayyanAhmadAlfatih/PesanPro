import { describe, expect, it, vi } from "vitest";
import { startMemoryWatchdog } from "./memory-watchdog";

const MB = 1024 * 1024;

function harness(rssValues: number[], limitMb = 700) {
  const onExceed = vi.fn();
  const logger = { warn: vi.fn(), error: vi.fn() };
  let index = 0;
  const watchdog = startMemoryWatchdog({
    limitBytes: limitMb * MB,
    readRssBytes: () => rssValues[Math.min(index++, rssValues.length - 1)],
    onExceed,
    logger,
  });
  watchdog.stop();
  return { watchdog, onExceed, logger };
}

describe("memory watchdog", () => {
  it("stays quiet while RSS is below the limit", async () => {
    const { watchdog, onExceed } = harness([100 * MB, 200 * MB, 690 * MB]);
    expect(await watchdog.check()).toBe(false);
    expect(await watchdog.check()).toBe(false);
    expect(await watchdog.check()).toBe(false);
    expect(onExceed).not.toHaveBeenCalled();
  });

  it("needs two consecutive breaches so a spike does not restart a healthy process", async () => {
    const { watchdog, onExceed } = harness([900 * MB, 100 * MB, 900 * MB]);
    expect(await watchdog.check()).toBe(false);
    expect(await watchdog.check()).toBe(false);
    expect(await watchdog.check()).toBe(false);
    expect(onExceed).not.toHaveBeenCalled();
  });

  it("shuts down once the breach persists", async () => {
    const { watchdog, onExceed, logger } = harness([900 * MB, 950 * MB]);
    expect(await watchdog.check()).toBe(false);
    expect(await watchdog.check()).toBe(true);
    expect(onExceed).toHaveBeenCalledTimes(1);
    expect(onExceed).toHaveBeenCalledWith({ rssBytes: 950 * MB, limitBytes: 700 * MB });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("does not trigger twice after the shutdown starts", async () => {
    const { watchdog, onExceed } = harness([900 * MB, 900 * MB, 900 * MB]);
    await watchdog.check();
    await watchdog.check();
    expect(await watchdog.check()).toBe(false);
    expect(onExceed).toHaveBeenCalledTimes(1);
  });

  it("retries on a later check when the shutdown itself fails", async () => {
    const onExceed = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    const logger = { warn: vi.fn(), error: vi.fn() };
    const watchdog = startMemoryWatchdog({
      limitBytes: 700 * MB,
      breachesToTrigger: 1,
      readRssBytes: () => 900 * MB,
      onExceed,
      logger,
    });
    watchdog.stop();

    expect(await watchdog.check()).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(await watchdog.check()).toBe(true);
    expect(onExceed).toHaveBeenCalledTimes(2);
  });
});
