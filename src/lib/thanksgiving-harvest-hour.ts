/**
 * Harvest hour (2026): one hour, at a time nobody is told ahead, sometime between 4 and 8 PM
 * Pacific on Thursday, November 5, when every catch counts double. The server picks the hour from
 * a secret (src/server/thanksgiving-harvest-hour.ts), so this public code can't give it away;
 * browsers only learn it once it has started (GET /api/thanksgiving/status).
 */

export const HARVEST_HOUR_WINDOW = {
  /** 4:00 PM Pacific (PST, UTC−8) on Thursday, November 5. */
  from: new Date("2026-11-05T16:00:00-08:00"),
  /** 8:00 PM Pacific: the hour has ended by then. */
  to: new Date("2026-11-05T20:00:00-08:00")
} as const;

export const HARVEST_HOUR_MS = 60 * 60_000;
/** During harvest hour each catch counts this many times. */
export const HARVEST_HOUR_MULTIPLIER = 2;

export type HarvestHour = { startsAt: Date; endsAt: Date };

const MINUTE_MS = 60_000;

/** The hour from a secret-derived number: it starts on a whole minute from 4:00 to 7:00 PM, so it ends by 8. */
export function harvestHourFromSeed(seed: number): HarvestHour {
  const from = HARVEST_HOUR_WINDOW.from.getTime();
  const slots = (HARVEST_HOUR_WINDOW.to.getTime() - from - HARVEST_HOUR_MS) / MINUTE_MS + 1;
  const offset = Math.abs(Math.floor(seed)) % slots;
  const startsAt = new Date(from + offset * MINUTE_MS);
  return { startsAt, endsAt: new Date(startsAt.getTime() + HARVEST_HOUR_MS) };
}

export function inHarvestHour(hour: HarvestHour, at: Date | number): boolean {
  const time = typeof at === "number" ? at : at.getTime();
  return time >= hour.startsAt.getTime() && time < hour.endsAt.getTime();
}

/** The public 4–8 PM window, when browsers check whether harvest hour has started. */
export function inHarvestHourWindow(now: Date | number): boolean {
  const time = typeof now === "number" ? now : now.getTime();
  return time >= HARVEST_HOUR_WINDOW.from.getTime() && time < HARVEST_HOUR_WINDOW.to.getTime();
}
