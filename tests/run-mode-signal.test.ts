import { describe, expect, it, vi } from "vitest";
import { isRunModeOpen, markRunModeOpen, msSinceRunModeClosed, subscribeRunMode } from "@/src/lib/run-mode-signal";

describe("run mode signal", () => {
  it("is open from mark until its cleanup, and remembers when it closed", () => {
    expect(isRunModeOpen()).toBe(false);
    expect(msSinceRunModeClosed()).toBe(Number.POSITIVE_INFINITY);

    const listener = vi.fn();
    const unsubscribe = subscribeRunMode(listener);
    const close = markRunModeOpen();
    expect(isRunModeOpen()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    const before = Date.now();
    close();
    expect(isRunModeOpen()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(msSinceRunModeClosed(before + 5_000)).toBeGreaterThanOrEqual(4_000);

    // A second cleanup call does nothing.
    close();
    expect(isRunModeOpen()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stays open until every mark closes", () => {
    const first = markRunModeOpen();
    const second = markRunModeOpen();
    first();
    expect(isRunModeOpen()).toBe(true);
    second();
    expect(isRunModeOpen()).toBe(false);
  });
});
