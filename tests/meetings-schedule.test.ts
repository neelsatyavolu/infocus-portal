import { describe, expect, it } from "vitest";
import {
  PRODUCER_SERIES,
  pacificDateKey,
  pacificWallTimeToUtc,
  producerOccurrences
} from "@/src/lib/meetings/schedule";

describe("pacificWallTimeToUtc", () => {
  it("uses PDT (UTC-7) in summer and PST (UTC-8) in winter", () => {
    expect(pacificWallTimeToUtc("2026-10-04", 21, 15).toISOString()).toBe("2026-10-05T04:15:00.000Z");
    expect(pacificWallTimeToUtc("2026-12-06", 21, 15).toISOString()).toBe("2026-12-07T05:15:00.000Z");
  });

  it("handles the fall-back day (Nov 1 2026) and the spring-forward day (Mar 14 2027)", () => {
    expect(pacificWallTimeToUtc("2026-11-01", 21, 15).toISOString()).toBe("2026-11-02T05:15:00.000Z");
    expect(pacificWallTimeToUtc("2027-03-14", 21, 15).toISOString()).toBe("2027-03-15T04:15:00.000Z");
  });
});

describe("pacificDateKey", () => {
  it("is the Pacific calendar date, not the UTC one", () => {
    expect(pacificDateKey(new Date("2026-10-05T04:15:00.000Z"))).toBe("2026-10-04");
    expect(pacificDateKey(new Date("2026-10-05T08:00:00.000Z"))).toBe("2026-10-05");
  });
});

describe("producerOccurrences", () => {
  it("yields Sun/Mon/Wed 21:15 Pacific for the next 21 days", () => {
    // Saturday Oct 3 2026, noon Pacific.
    const now = new Date("2026-10-03T19:00:00.000Z");
    const slots = producerOccurrences(now);
    expect(slots.slice(0, 3)).toEqual([
      { occurrenceKey: "2026-10-04", startsAt: new Date("2026-10-05T04:15:00.000Z") },
      { occurrenceKey: "2026-10-05", startsAt: new Date("2026-10-06T04:15:00.000Z") },
      { occurrenceKey: "2026-10-07", startsAt: new Date("2026-10-08T04:15:00.000Z") }
    ]);
    expect(slots).toHaveLength(9);
    for (const slot of slots) {
      expect(slot.startsAt.getTime()).toBeLessThanOrEqual(now.getTime() + 21 * 24 * 3600 * 1000);
    }
  });

  it("crosses the November DST change at 21:15 local on both sides", () => {
    const slots = producerOccurrences(new Date("2026-10-24T19:00:00.000Z"));
    const byKey = Object.fromEntries(slots.map((slot) => [slot.occurrenceKey, slot.startsAt.toISOString()]));
    expect(byKey["2026-10-25"]).toBe("2026-10-26T04:15:00.000Z");
    expect(byKey["2026-11-01"]).toBe("2026-11-02T05:15:00.000Z");
    expect(byKey["2026-11-02"]).toBe("2026-11-03T05:15:00.000Z");
  });

  it("crosses the March DST change at 21:15 local on both sides", () => {
    const slots = producerOccurrences(new Date("2027-03-06T20:00:00.000Z"));
    const byKey = Object.fromEntries(slots.map((slot) => [slot.occurrenceKey, slot.startsAt.toISOString()]));
    expect(byKey["2027-03-10"]).toBe("2027-03-11T05:15:00.000Z");
    expect(byKey["2027-03-14"]).toBe("2027-03-15T04:15:00.000Z");
  });

  it("keeps today's slot while it is still running and drops it once over", () => {
    // Sunday Oct 4 2026 at 21:45 Pacific: today's meeting is half over.
    const during = producerOccurrences(new Date("2026-10-05T04:45:00.000Z"));
    expect(during[0].occurrenceKey).toBe("2026-10-04");
    const after = producerOccurrences(new Date("2026-10-05T05:20:00.000Z"));
    expect(after[0].occurrenceKey).toBe("2026-10-05");
  });

  it("is deterministic, so createMany skipDuplicates makes ensure idempotent", () => {
    const now = new Date("2026-10-03T19:00:00.000Z");
    expect(producerOccurrences(now)).toEqual(producerOccurrences(now));
  });

  it("describes the default series", () => {
    expect(PRODUCER_SERIES).toMatchObject({ seriesKey: "producers", title: "Producer meeting", durationMinutes: 60 });
  });
});
