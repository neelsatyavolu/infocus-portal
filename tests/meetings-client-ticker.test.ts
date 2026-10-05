import { afterEach, describe, expect, it, vi } from "vitest";
import { TICK_MS, onTick } from "@/src/lib/meetings/client/ticker";

describe("onTick", () => {
  afterEach(() => vi.useRealTimers());

  it("ticks every ~100 ms for each listener and stops when the last one leaves", () => {
    vi.useFakeTimers();
    const a = vi.fn();
    const b = vi.fn();
    const stopA = onTick(a);
    const stopB = onTick(b);
    vi.advanceTimersByTime(TICK_MS * 5);
    expect(a).toHaveBeenCalledTimes(5);
    expect(b).toHaveBeenCalledTimes(5);
    stopA();
    vi.advanceTimersByTime(TICK_MS * 2);
    expect(a).toHaveBeenCalledTimes(5);
    expect(b).toHaveBeenCalledTimes(7);
    stopB();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps ticking for others when one listener throws", () => {
    vi.useFakeTimers();
    const ok = vi.fn();
    const stopBad = onTick(() => {
      throw new Error("boom");
    });
    const stopOk = onTick(ok);
    vi.advanceTimersByTime(TICK_MS * 3);
    expect(ok).toHaveBeenCalledTimes(3);
    stopBad();
    stopOk();
  });
});
