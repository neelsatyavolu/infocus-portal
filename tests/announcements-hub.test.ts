import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANNOUNCEMENTS_LAST_SEEN_TS_KEY,
  compareSlackTs,
  isSlackTs,
  markAnnouncementsSeen,
  readLastSeenTs
} from "@/components/announcements/announcements-seen";
import { submittedAirCounts, submittedAirCountsLine } from "@/components/announcements/air-counts";
import { activeBucketChoice, bucketChips, isBucketChoice } from "@/components/announcements/bucket-choice";
import { buildFeedDays, groupFeedDaysByMonth } from "@/components/announcements/slack-feed";
import { guardedHref, type LinkClick } from "@/components/announcements/use-leave-guard";
import type { SlackAnnouncementItem } from "@/src/lib/slack-announcements";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values
  };
}

function post(id: string, postedAt: string): SlackAnnouncementItem {
  return {
    id,
    ts: "1760541600.000100",
    authorName: "Abby",
    authorImageUrl: null,
    text: "Hello",
    parts: [],
    attachments: [],
    postedAt,
    dateLabel: "",
    timeLabel: "9:00 AM",
    permalink: "https://example.slack.com/archives/C0/p1"
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Slack timestamps", () => {
  it("compares whole seconds, then the fraction without float rounding", () => {
    expect(compareSlackTs("1760541601.000000", "1760541600.999999")).toBeGreaterThan(0);
    expect(compareSlackTs("1760541600.000200", "1760541600.000100")).toBeGreaterThan(0);
    expect(compareSlackTs("1760541600.1", "1760541600.100000")).toBe(0);
    expect(compareSlackTs("1760541600", "1760541600.000001")).toBeLessThan(0);
  });

  it("accepts only Slack-shaped timestamps", () => {
    expect(isSlackTs("1760541600.123456")).toBe(true);
    expect(isSlackTs("1760541600")).toBe(true);
    expect(isSlackTs("abc")).toBe(false);
    expect(isSlackTs('1"]{}')).toBe(false);
  });
});

describe("last seen post", () => {
  it("returns null without a window or with a malformed value", () => {
    expect(readLastSeenTs()).toBeNull();
    vi.stubGlobal("window", { localStorage: memoryStorage({ [ANNOUNCEMENTS_LAST_SEEN_TS_KEY]: "nope" }) });
    expect(readLastSeenTs()).toBeNull();
  });

  it("records the newest post and never moves backwards", () => {
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });

    markAnnouncementsSeen("1760541600.000200");
    expect(readLastSeenTs()).toBe("1760541600.000200");

    markAnnouncementsSeen("1760541600.000100");
    expect(readLastSeenTs()).toBe("1760541600.000200");

    markAnnouncementsSeen(null);
    markAnnouncementsSeen("bad");
    expect(storage.values.get(ANNOUNCEMENTS_LAST_SEEN_TS_KEY)).toBe("1760541600.000200");
  });

  it("survives blocked storage", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked");
      }
    });
    expect(readLastSeenTs()).toBeNull();
    expect(() => markAnnouncementsSeen("1760541600.000200")).not.toThrow();
  });
});

describe("feed days", () => {
  const now = new Date("2026-10-15T20:00:00Z");

  it("builds Pacific-date ids, rail labels and the year on older days", () => {
    const days = buildFeedDays(
      [
        { dateLabel: "Thursday, October 15", items: [post("a", "2026-10-15T18:00:00Z")] },
        { dateLabel: "Wednesday, October 15", items: [post("b", "2025-10-15T18:00:00Z")] }
      ],
      now
    );
    expect(days[0]).toMatchObject({
      id: "day-2026-10-15",
      label: "Thursday, October 15",
      shortLabel: "Thu 15",
      monthLabel: "October 2026"
    });
    expect(days[1]).toMatchObject({ id: "day-2025-10-15", label: "Wednesday, October 15, 2025", monthLabel: "October 2025" });
  });

  it("keeps ids unique and falls back when a date can't be read", () => {
    const days = buildFeedDays(
      [
        { dateLabel: "Thursday, October 15", items: [post("a", "2026-10-15T18:00:00Z")] },
        { dateLabel: "Thursday, October 15", items: [post("b", "2026-10-15T17:00:00Z")] },
        { dateLabel: "Someday", items: [post("c", "not a date")] }
      ],
      now
    );
    expect(days.map((day) => day.id)).toEqual(["day-2026-10-15", "day-2026-10-15-1", "day-2"]);
    expect(days[2]).toMatchObject({ label: "Someday", shortLabel: "Someday", monthLabel: "Earlier" });
  });

  it("groups consecutive days by month with post totals", () => {
    const days = buildFeedDays(
      [
        { dateLabel: "Thursday, October 15", items: [post("a", "2026-10-15T18:00:00Z"), post("b", "2026-10-15T17:00:00Z")] },
        { dateLabel: "Friday, October 2", items: [post("c", "2026-10-02T18:00:00Z")] },
        { dateLabel: "Wednesday, September 30", items: [post("d", "2026-09-30T18:00:00Z")] }
      ],
      now
    );
    const months = groupFeedDaysByMonth(days);
    expect(months.map((month) => [month.label, month.posts, month.days.length])).toEqual([
      ["October 2026", 3, 2],
      ["September 2026", 1, 1]
    ]);
  });
});

describe("Submitted section filter", () => {
  const buckets = [
    { id: "today" as const, title: "Air today", entries: [1, 2] },
    { id: "ended" as const, title: "Ended", entries: [3] }
  ];

  it("validates stored choices", () => {
    expect(isBucketChoice("all")).toBe(true);
    expect(isBucketChoice("today")).toBe(true);
    expect(isBucketChoice("yesterday")).toBe(false);
  });

  it("falls back to All when the remembered section is empty today", () => {
    expect(activeBucketChoice("ended", buckets)).toBe("ended");
    expect(activeBucketChoice("tomorrow", buckets)).toBe("all");
  });

  it("builds All plus one chip per section, with counts, only when there is a choice", () => {
    expect(bucketChips(buckets, 3)).toEqual([
      { value: "all", label: "All", count: 3 },
      { value: "today", label: "Air today", count: 2 },
      { value: "ended", label: "Ended", count: 1 }
    ]);
    expect(bucketChips(buckets.slice(0, 1), 2)).toEqual([]);
  });
});

describe("Submitted header counts", () => {
  const fridayShow = new Date("2026-09-04T17:00:00.000Z");
  const tuesdayBeforeShow = new Date("2026-09-08T17:00:00.000Z");
  const entries = [
    { startDate: "2026-09-04", endDate: "2026-09-16" },
    { isPermanent: true },
    { isPermanent: true, runOn: "SCHOOLOGY_ONLY" },
    { startDate: "2026-08-10", endDate: "2026-08-12" }
  ];

  it("counts permanent entries on show days, as the header always has", () => {
    expect(submittedAirCounts(entries, fridayShow)).toEqual({
      total: 4,
      today: 2,
      tomorrow: 0,
      permanentToday: true,
      permanentTomorrow: false
    });
    expect(submittedAirCounts(entries, tuesdayBeforeShow)).toEqual({
      total: 4,
      today: 0,
      tomorrow: 2,
      permanentToday: false,
      permanentTomorrow: true
    });
  });

  it("writes one line and names permanent only where it is counted", () => {
    expect(submittedAirCountsLine(submittedAirCounts(entries, fridayShow))).toBe(
      "4 total · 2 air today (with permanent) · 0 air tomorrow"
    );
    expect(submittedAirCountsLine(submittedAirCounts([], fridayShow))).toBe("0 total · 0 air today · 0 air tomorrow");
  });
});

describe("PA leave guard", () => {
  const location = {
    href: "https://portal.example.edu/announcements/pa",
    origin: "https://portal.example.edu",
    pathname: "/announcements/pa",
    search: ""
  };
  const click = (overrides: Partial<LinkClick>): LinkClick => ({
    defaultPrevented: false,
    button: 0,
    modified: false,
    href: "https://portal.example.edu/announcements/submitted",
    target: "",
    download: false,
    ...overrides
  });

  it("stops plain clicks on in-app links to another page", () => {
    expect(guardedHref(click({}), location)).toBe("/announcements/submitted");
    expect(guardedHref(click({ href: "/master-calendar?view=week#today" }), location)).toBe("/master-calendar?view=week#today");
  });

  it("leaves new tabs, other sites, this page and non-plain clicks alone", () => {
    expect(guardedHref(click({ target: "_blank" }), location)).toBeNull();
    expect(guardedHref(click({ download: true }), location)).toBeNull();
    expect(guardedHref(click({ href: "https://example.com/x" }), location)).toBeNull();
    expect(guardedHref(click({ href: "/announcements/pa#pa-script" }), location)).toBeNull();
    expect(guardedHref(click({ modified: true }), location)).toBeNull();
    expect(guardedHref(click({ button: 1 }), location)).toBeNull();
    expect(guardedHref(click({ defaultPrevented: true }), location)).toBeNull();
    expect(guardedHref(click({ href: null }), location)).toBeNull();
  });
});
