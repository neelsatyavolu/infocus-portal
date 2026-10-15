import { airWindowFor } from "@/src/lib/announcement-submission";

type AirFields = Omit<Parameters<typeof airWindowFor>[0], "now">;

/**
 * The Submitted header's counts: how many entries air today and tomorrow. Unlike the section
 * chips, permanent entries count here on show days (what anchors read before the show), so each
 * count also says whether a permanent entry is in it. Tomorrow leaves out what already airs today.
 */
export function submittedAirCounts(entries: readonly AirFields[], now?: Date) {
  const windows = entries.map((entry) => ({ entry, window: airWindowFor({ ...entry, now }) }));
  const today = windows.filter(({ window }) => window.airsToday);
  const tomorrow = windows.filter(({ window }) => window.airsTomorrow && !window.airsToday);
  return {
    total: entries.length,
    today: today.length,
    tomorrow: tomorrow.length,
    permanentToday: today.some(({ entry }) => Boolean(entry.isPermanent)),
    permanentTomorrow: tomorrow.some(({ entry }) => Boolean(entry.isPermanent))
  };
}

/** One tabular line: "12 total · 3 air today (with permanent) · 1 air tomorrow". */
export function submittedAirCountsLine(counts: ReturnType<typeof submittedAirCounts>) {
  const withPermanent = (has: boolean) => (has ? " (with permanent)" : "");
  return [
    `${counts.total} total`,
    `${counts.today} air today${withPermanent(counts.permanentToday)}`,
    `${counts.tomorrow} air tomorrow${withPermanent(counts.permanentTomorrow)}`
  ].join(" · ");
}
