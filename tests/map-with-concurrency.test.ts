import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/src/lib/map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("keeps input order and caps calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, n));
      inFlight -= 1;
      return n * 2;
    });
    expect(result).toEqual([10, 2, 8, 4, 6, 0, 12]);
    expect(peak).toBe(3);
  });

  it("handles an empty list", async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([]);
  });

  it("rejects when a task rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});
