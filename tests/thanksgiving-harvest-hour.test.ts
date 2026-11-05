import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HARVEST_HOUR_MS,
  HARVEST_HOUR_WINDOW,
  harvestHourFromSeed,
  inHarvestHour,
  inHarvestHourWindow
} from "@/src/lib/thanksgiving-harvest-hour";
import { harvestHour } from "@/src/server/thanksgiving-harvest-hour";

const FROM = HARVEST_HOUR_WINDOW.from.getTime();
const TO = HARVEST_HOUR_WINDOW.to.getTime();

describe("harvestHourFromSeed", () => {
  it("starts on a whole minute from 4:00 to 7:00 PM and lasts an hour, so it ends by 8", () => {
    expect(harvestHourFromSeed(0).startsAt.getTime()).toBe(FROM);
    expect(harvestHourFromSeed(180).startsAt.getTime()).toBe(TO - HARVEST_HOUR_MS);
    expect(harvestHourFromSeed(181).startsAt.getTime()).toBe(FROM);
    for (const seed of [7, 99, 4_294_967_295]) {
      const hour = harvestHourFromSeed(seed);
      expect(hour.startsAt.getTime() % 60_000).toBe(0);
      expect(hour.endsAt.getTime() - hour.startsAt.getTime()).toBe(HARVEST_HOUR_MS);
      expect(hour.endsAt.getTime()).toBeLessThanOrEqual(TO);
    }
  });

  it("counts its first minute and not the moment it ends", () => {
    const hour = harvestHourFromSeed(30);
    expect(inHarvestHour(hour, hour.startsAt)).toBe(true);
    expect(inHarvestHour(hour, hour.endsAt.getTime() - 1)).toBe(true);
    expect(inHarvestHour(hour, hour.endsAt)).toBe(false);
    expect(inHarvestHour(hour, hour.startsAt.getTime() - 1)).toBe(false);
  });

  it("knows the public 4–8 PM window", () => {
    expect(inHarvestHourWindow(FROM - 1)).toBe(false);
    expect(inHarvestHourWindow(FROM)).toBe(true);
    expect(inHarvestHourWindow(TO)).toBe(false);
  });
});

describe("harvestHour", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is the same hour every time for one secret, inside the window", () => {
    vi.stubEnv("APP_AUTH_SECRET", "secret-one");
    const first = harvestHour();
    expect(harvestHour()).toEqual(first);
    expect(first.startsAt.getTime()).toBeGreaterThanOrEqual(FROM);
    expect(first.endsAt.getTime()).toBeLessThanOrEqual(TO);
  });
});
