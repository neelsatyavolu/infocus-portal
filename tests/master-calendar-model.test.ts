import { describe, expect, it } from "vitest";
import {
  buildDayModels,
  buildPillHtml,
  buildWeekRows,
  buildWeekSegments,
  defaultSelectedDate,
  extractPackageIds,
  formatDateRange,
  monthCountsLine,
  queueLabel,
  removePillFromHtml,
  renamePillInHtml,
  stepDay,
  summarizeMonth,
  toDateKey,
  type ScheduleDay
} from "@/components/master-calendar/calendar-model";
import { setCalendarAnchors, setCalendarPaAnnouncers } from "@/src/lib/calendar-show-content";

// November 2026: Mon Nov 2 … Mon Nov 30 (no Spirit Week). Every weekday gets an explicit schedule,
// so the tests don't depend on the school's real holiday list.
const NOVEMBER = new Date(2026, 10, 1);
const WEEKS = buildWeekRows(NOVEMBER);
const KIND_BY_WEEKDAY: ScheduleDay["kind"][] = ["PA", "NONE", "SHOW", "NONE", "SHOW"];

function novemberSchedule(overrides: Record<string, Partial<ScheduleDay>> = {}): ScheduleDay[] {
  return WEEKS.flatMap((week) =>
    week.flatMap((date, index) => {
      if (!date) return [];
      const dateKey = toDateKey(date);
      return [{ date: dateKey, kind: KIND_BY_WEEKDAY[index], label: "", ...overrides[dateKey] }];
    })
  );
}

function novemberDays({
  entries = {},
  todayKey = "2026-11-10",
  canEdit = true,
  overrides = {}
}: {
  entries?: Record<string, string>;
  todayKey?: string | null;
  canEdit?: boolean;
  overrides?: Record<string, Partial<ScheduleDay>>;
} = {}) {
  return buildDayModels({
    weeks: WEEKS,
    entries,
    scheduleDays: novemberSchedule(overrides),
    queuedPackages: [],
    showManagers: {},
    todayKey,
    canEdit
  });
}

describe("package pills in notes HTML", () => {
  const pill = buildPillHtml("pkg-1", "Robotics team");

  it("builds a pill with escaped attributes and text", () => {
    expect(buildPillHtml("p\"1", "Tom & <Jerry>")).toBe(
      '<span class="package-pill" data-package-id="p&quot;1" data-display-label="Tom &amp; &lt;Jerry&gt;">Tom &amp; &lt;Jerry&gt;</span>'
    );
  });

  it("finds every package id once", () => {
    expect(Array.from(extractPackageIds(`<p>${pill} and ${pill} ${buildPillHtml("pkg-2", "Band")}</p>`))).toEqual([
      "pkg-1",
      "pkg-2"
    ]);
    expect(extractPackageIds("").size).toBe(0);
  });

  it("renames only the matching pill, keeping its id", () => {
    const html = `<p>${pill} then ${buildPillHtml("pkg-2", "Band")}</p>`;
    const next = renamePillInHtml(html, "pkg-1", "Robots & more");
    expect(next).toContain('data-package-id="pkg-1" data-display-label="Robots &amp; more">Robots &amp; more</span>');
    expect(next).toContain('data-display-label="Band">Band</span>');
  });

  it("removes the matching pill (with or without text) and nothing else", () => {
    const empty = '<span class="package-pill" data-package-id="pkg-3" data-display-label="x"></span>';
    const html = `<p>Before ${pill}${empty} after ${buildPillHtml("pkg-2", "Band")}</p>`;
    const withoutOne = removePillFromHtml(html, "pkg-1");
    expect(withoutOne).not.toContain("pkg-1");
    expect(withoutOne).toContain("pkg-2");
    expect(removePillFromHtml(withoutOne, "pkg-3")).toBe(`<p>Before  after ${buildPillHtml("pkg-2", "Band")}</p>`);
  });

  it("treats ids as text, not patterns", () => {
    const html = buildPillHtml("a.b", "One") + buildPillHtml("axb", "Two");
    expect(removePillFromHtml(html, "a.b")).toBe(buildPillHtml("axb", "Two"));
  });
});

describe("day models", () => {
  it("flags upcoming shows and PA days with an empty slot, for producers only", () => {
    const days = novemberDays({
      entries: {
        "2026-11-11": setCalendarAnchors("", ["Abby", "Otto"]),
        "2026-11-16": setCalendarPaAnnouncers("", ["Sage"])
      }
    });
    const byKey = new Map(days.map((day) => [day.dateKey, day]));
    expect(byKey.get("2026-11-04")?.anchorsNeeded).toBe(false); // past
    expect(byKey.get("2026-11-11")?.anchors).toEqual(["Abby", "Otto"]);
    expect(byKey.get("2026-11-11")?.anchorsNeeded).toBe(false);
    expect(byKey.get("2026-11-13")?.anchorsNeeded).toBe(true);
    expect(byKey.get("2026-11-16")?.paNeeded).toBe(true); // one of two
    expect(novemberDays({ canEdit: false }).some((day) => day.anchorsNeeded || day.paNeeded)).toBe(false);
  });

  it("marks today, past days and days that break the weekday pattern", () => {
    const days = novemberDays({ overrides: { "2026-11-17": { kind: "SHOW", label: "" } } });
    const byKey = new Map(days.map((day) => [day.dateKey, day]));
    expect(byKey.get("2026-11-10")?.isToday).toBe(true);
    expect(byKey.get("2026-11-09")?.isPast).toBe(true);
    expect(byKey.get("2026-11-17")?.patternTag).toBe("Show");
    expect(byKey.get("2026-11-18")?.patternTag).toBeNull();
  });
});

describe("month summary", () => {
  it("counts the month and only upcoming days that still need people", () => {
    const summary = summarizeMonth(
      novemberDays({ overrides: { "2026-11-27": { kind: "HOLIDAY", label: "Thanksgiving" } } }),
      "2026-11-10"
    );
    // Shows: Wed/Fri = 8, minus the 27th. PA: 5 Mondays.
    expect(summary).toEqual({
      shows: 7,
      paDays: 5,
      daysOff: 1,
      upcomingCastDays: 8,
      showsNeedingAnchors: 5,
      paDaysNeedingAnnouncers: 3
    });
    expect(monthCountsLine(summary)).toBe("7 shows · 5 PA days · 1 day off");
    expect(monthCountsLine({ shows: 1, paDays: 1, daysOff: 0 })).toBe("1 show · 1 PA day");
  });
});

describe("board layout", () => {
  it("gives every weekday its own segment and labels the week", () => {
    const days = novemberDays({
      overrides: {
        "2026-11-25": { kind: "HOLIDAY", label: "Break" },
        "2026-11-26": { kind: "HOLIDAY", label: "Break" },
        "2026-11-27": { kind: "HOLIDAY", label: "Break" }
      }
    });
    const rows = buildWeekSegments(WEEKS, new Map(days.map((day) => [day.dateKey, day])));
    expect(rows).toHaveLength(5);
    expect(rows[3].segments.map((segment) => segment.type)).toEqual(["day", "day", "day", "day", "day"]);
    expect(rows[3].label).toBe("Nov 23 – 27");
    expect(rows[4].segments.map((segment) => segment.type)).toEqual(["day", "blank", "blank", "blank", "blank"]);
    expect(rows[1].hasToday).toBe(true);
  });

  it("formats week ranges inside and across months", () => {
    expect(formatDateRange("2026-11-02", "2026-11-06")).toBe("Nov 2 – 6");
    expect(formatDateRange("2026-10-30", "2026-11-03")).toBe("Oct 30 – Nov 3");
    expect(formatDateRange("2026-11-30", "2026-11-30")).toBe("Nov 30");
  });
});

describe("selection", () => {
  it("opens producers on the first day that still needs people", () => {
    const days = novemberDays({
      entries: { "2026-11-11": setCalendarAnchors("", ["Abby", "Otto"]) },
      todayKey: "2026-11-11"
    });
    // Nov 11 is filled, Nov 13 (Fri) is the first upcoming show without anchors.
    expect(defaultSelectedDate(days, "2026-11", "2026-11-11", true)).toBe("2026-11-13");
  });

  it("opens everyone else on today, a weekend on the next weekday, else the month's first weekday", () => {
    const days = novemberDays({ canEdit: false, todayKey: "2026-11-14" });
    expect(defaultSelectedDate(days, "2026-11", "2026-11-11", false)).toBe("2026-11-11");
    expect(defaultSelectedDate(days, "2026-11", "2026-11-14", false)).toBe("2026-11-16");
    expect(defaultSelectedDate(days, "2026-11", "2026-10-20", false)).toBe("2026-11-02");
    expect(defaultSelectedDate([], "2026-11", null, false)).toBeNull();
  });

  it("steps through weekdays without wrapping", () => {
    const days = novemberDays();
    expect(stepDay(days, "2026-11-06", 1)).toBe("2026-11-09");
    expect(stepDay(days, "2026-11-09", -1)).toBe("2026-11-06");
    expect(stepDay(days, "2026-11-02", -1)).toBeNull();
    expect(stepDay(days, "2026-11-30", 1)).toBeNull();
    expect(stepDay(days, null, 1)).toBe("2026-11-02");
    expect(stepDay([], "2026-11-02", 1)).toBeNull();
  });
});

describe("queue labels", () => {
  it("adds the cycle unless the row is custom", () => {
    expect(queueLabel({ groupTopic: "Robotics", cycleNumber: 3 })).toBe("Robotics · C3");
    expect(queueLabel({ groupTopic: "Robotics", cycleNumber: 3, custom: true })).toBe("Robotics");
    expect(queueLabel({ groupTopic: "", cycleNumber: 0 })).toBe("Untitled");
  });
});

describe("birthdays on the day model", () => {
  it("puts each day's birthdays on that day and leaves the rest empty", () => {
    const birthdays = { "2026-11-06": [{ name: "Otto", actualDate: "2026-11-08" }] };
    const days = buildDayModels({
      weeks: WEEKS,
      entries: {},
      scheduleDays: novemberSchedule(),
      queuedPackages: [],
      showManagers: {},
      birthdays,
      todayKey: "2026-11-10",
      canEdit: false
    });
    expect(days.find((day) => day.dateKey === "2026-11-06")?.birthdays).toEqual(birthdays["2026-11-06"]);
    expect(days.find((day) => day.dateKey === "2026-11-05")?.birthdays).toEqual([]);
  });
});
