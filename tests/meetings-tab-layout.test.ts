import { describe, expect, it } from "vitest";
import { boardLists } from "@/components/meetings/tab/board-lists";
import {
  pastDayLabel,
  shiftDayKey,
  shortDateLabel,
  upcomingDayLabel,
  wallTimeLabel,
  weekdayListLabel
} from "@/components/meetings/tab/day-label";
import { canJoinNow } from "@/src/lib/meetings/client/time";
import type { MeetingListResponse, MeetingSummary } from "@/src/lib/meetings/types";

function meeting(id: string, startsAt: string, extra: Partial<MeetingSummary> = {}): MeetingSummary {
  return {
    id,
    title: `Meeting ${id}`,
    startsAt,
    joinOpensAt: new Date(new Date(startsAt).getTime() - 5 * 60_000).toISOString(),
    durationMinutes: 60,
    status: "SCHEDULED",
    access: "OPEN",
    inviteeCount: 0,
    seriesKey: null,
    isHost: false,
    canEdit: false,
    notesEnabled: true,
    quickAccess: false,
    notesStatus: "NONE",
    participantCount: 0,
    agendaCount: 0,
    createdByName: "Sage",
    ...extra
  };
}

describe("shiftDayKey", () => {
  it("moves across month and year ends", () => {
    expect(shiftDayKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("never skips or repeats a day across a DST change", () => {
    expect(shiftDayKey("2026-11-01", 1)).toBe("2026-11-02");
    expect(shiftDayKey("2026-03-08", -1)).toBe("2026-03-07");
    expect(shiftDayKey("2026-03-07", 1)).toBe("2026-03-08");
  });
});

describe("upcomingDayLabel", () => {
  const today = "2026-10-15"; // a Thursday

  it("says Today and Tomorrow by the Pacific day, not 24 hours", () => {
    // 9:15 PM PDT on Oct 15 is 04:15 UTC on Oct 16.
    expect(upcomingDayLabel("2026-10-16T04:15:00Z", today)).toBe("Today");
    expect(upcomingDayLabel("2026-10-17T04:15:00Z", today)).toBe("Tomorrow");
  });

  it("splits at Pacific midnight", () => {
    expect(upcomingDayLabel("2026-10-16T06:59:00Z", today)).toBe("Today"); // 11:59 PM PDT
    expect(upcomingDayLabel("2026-10-16T07:00:00Z", today)).toBe("Tomorrow"); // 12:00 AM PDT
  });

  it("uses the short weekday and date after tomorrow", () => {
    expect(upcomingDayLabel("2026-10-19T04:15:00Z", today)).toBe("Sun 18");
  });

  it("knows tomorrow across the end of daylight time", () => {
    // Sunday Nov 1, 9:15 PM PST (UTC-8).
    expect(upcomingDayLabel("2026-11-02T05:15:00Z", "2026-10-31")).toBe("Tomorrow");
  });
});

describe("pastDayLabel", () => {
  it("says Today for today, else the month and day", () => {
    expect(pastDayLabel("2026-10-16T04:15:00Z", "2026-10-15")).toBe("Today");
    expect(pastDayLabel("2026-10-15T04:15:00Z", "2026-10-15")).toBe("Oct 14");
  });
});

describe("producer meeting card labels", () => {
  it("lists weekdays in plain English", () => {
    expect(weekdayListLabel([0, 1, 3])).toBe("Sun, Mon and Wed");
    expect(weekdayListLabel([1, 5])).toBe("Mon and Fri");
    expect(weekdayListLabel([2])).toBe("Tue");
    expect(weekdayListLabel([])).toBe("");
  });

  it("writes wall times on a 12-hour clock", () => {
    expect(wallTimeLabel(21, 15)).toBe("9:15 PM");
    expect(wallTimeLabel(0, 5)).toBe("12:05 AM");
    expect(wallTimeLabel(12, 0)).toBe("12:00 PM");
    expect(wallTimeLabel(11, 59)).toBe("11:59 AM");
  });

  it("shows the next date in Pacific time", () => {
    expect(shortDateLabel("2026-10-16T04:15:00Z")).toBe("Thu, Oct 15");
  });
});

describe("boardLists", () => {
  const live = meeting("live", "2026-10-16T04:15:00Z", { status: "LIVE", seriesKey: "producers" });
  const later = meeting("later", "2026-10-18T04:15:00Z", { seriesKey: "producers" });
  const soon = meeting("soon", "2026-10-16T05:00:00Z");
  const oldPast = meeting("old", "2026-10-12T04:15:00Z", { status: "ENDED" });
  const newPast = meeting("new", "2026-10-14T04:15:00Z", { status: "ENDED" });
  const data: MeetingListResponse = {
    live: [live],
    upcoming: [later, soon],
    past: [oldPast, newPast],
    canCreateInviteOnly: false
  };

  it("sorts upcoming oldest first and past newest first", () => {
    const lists = boardLists(data, new Set());
    expect(lists.now.map((m) => m.id)).toEqual(["live"]);
    expect(lists.upcoming.map((m) => m.id)).toEqual(["soon", "later"]);
    expect(lists.past.map((m) => m.id)).toEqual(["new", "old"]);
  });

  it("moves a meeting into Now once it opens to join", () => {
    const now = new Date("2026-10-16T04:56:00Z").getTime(); // 4 minutes before "soon"
    const open = new Set(data.upcoming.filter((m) => canJoinNow(m, now)).map((m) => m.id));
    const lists = boardLists(data, open);
    expect(lists.now.map((m) => m.id)).toEqual(["live", "soon"]);
    expect(lists.upcoming.map((m) => m.id)).toEqual(["later"]);
    expect(lists.startingCount).toBe(1);
  });

  it("counts the open scheduled meetings, so an empty Upcoming can say 'nothing else'", () => {
    expect(boardLists(data, new Set()).startingCount).toBe(0);
    const lists = boardLists({ ...data, upcoming: [soon] }, new Set(["soon"]));
    expect(lists.upcoming).toEqual([]);
    expect(lists.startingCount).toBe(1);
  });

  it("reports the producer meeting's live state and next date", () => {
    const lists = boardLists(data, new Set());
    expect(lists.seriesLive).toBe(true);
    expect(lists.seriesNext?.id).toBe("later");
    expect(boardLists({ ...data, live: [], upcoming: [soon] }, new Set())).toMatchObject({ seriesLive: false, seriesNext: null });
  });

  it("never changes the list it was given", () => {
    boardLists(data, new Set(["soon"]));
    expect(data.upcoming.map((m) => m.id)).toEqual(["later", "soon"]);
    expect(data.past.map((m) => m.id)).toEqual(["old", "new"]);
  });
});
