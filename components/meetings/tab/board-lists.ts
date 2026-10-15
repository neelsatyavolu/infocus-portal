import type { MeetingListResponse, MeetingSummary } from "@/src/lib/meetings/types";

const oldestFirst = (a: MeetingSummary, b: MeetingSummary) => a.startsAt.localeCompare(b.startsAt);
const newestFirst = (a: MeetingSummary, b: MeetingSummary) => b.startsAt.localeCompare(a.startsAt);

/**
 * Splits the list into the Meetings tab's panels. Now: live meetings, then upcoming ones already
 * open to join (`openIds`, from canJoinNow; `startingCount` of them). Upcoming: the rest, oldest
 * first. Past: newest first. Plus what the InFocus Producer Meeting card shows (a series meeting
 * live, the next one). Pure, and never changes `data`.
 */
export function boardLists(data: MeetingListResponse, openIds: ReadonlySet<string>) {
  const upcoming = [...data.upcoming].sort(oldestFirst);
  const starting = upcoming.filter((m) => openIds.has(m.id));
  return {
    now: [...[...data.live].sort(oldestFirst), ...starting],
    startingCount: starting.length,
    upcoming: upcoming.filter((m) => !openIds.has(m.id)),
    past: [...data.past].sort(newestFirst),
    seriesLive: data.live.some((m) => m.seriesKey),
    seriesNext: upcoming.find((m) => m.seriesKey) ?? null
  };
}

export type BoardLists = ReturnType<typeof boardLists>;
