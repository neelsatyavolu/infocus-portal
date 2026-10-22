import { describe, expect, it } from "vitest";
import {
  daysOutFrom,
  fallbackTitle,
  generatorHref,
  inConfirmationWindow,
  isShowDay,
  needsRolesConfirmation,
  openSlotCount,
  packagesTag,
  roleStatus,
  rolesSummary,
  showHref,
  showManagerOptions,
  stripItems,
  whenLabel,
  type Overview
} from "@/app/(app)/show-roles/show-overview";

const ROLES = ["Show Director", "Teleprompter", "Floor Director"];

function overview(patch: Partial<Overview> = {}): Overview {
  return {
    date: "2026-10-21",
    label: "Wednesday, October 21",
    kind: "SHOW",
    mode: "VOLUNTEER",
    weekOfMonth: 3,
    members: ["Abby", "Otto", "Sage"],
    roles: ROLES,
    anchors: [],
    paAnnouncers: [],
    assignments: {},
    confirmed: {},
    monthAnchors: [],
    suggestedAnchors: [],
    suggestedPa: [],
    packages: [],
    upcomingShows: [
      { date: "2026-10-21", label: "Wednesday, October 21", mode: "VOLUNTEER", packageCount: 2, showManager: "Otto" },
      { date: "2026-10-23", label: "Friday, October 23", mode: "VOLUNTEER", packageCount: 0, showManager: "" },
      { date: "2026-10-28", label: "Wednesday, October 28", mode: "RANDOM", packageCount: 1, showManager: "Sage" }
    ],
    teleprompterDocId: null,
    teleprompterHref: "/teleprompter?showDate=2026-10-21",
    ...patch
  };
}

describe("daysOutFrom", () => {
  it("counts whole days from today's midnight, whatever the time of day", () => {
    expect(daysOutFrom("2026-10-15", new Date(2026, 9, 15, 23, 59))).toBe(0);
    expect(daysOutFrom("2026-10-16", new Date(2026, 9, 15, 0, 1))).toBe(1);
    expect(daysOutFrom("2026-10-14", new Date(2026, 9, 15, 12))).toBe(-1);
  });

  it("stays whole across the daylight-saving change", () => {
    expect(daysOutFrom("2026-11-02", new Date(2026, 9, 31, 22))).toBe(2);
    expect(daysOutFrom("2026-03-09", new Date(2026, 2, 7, 22))).toBe(2);
  });
});

describe("whenLabel", () => {
  it("says when a show day airs", () => {
    expect(whenLabel(0)).toBe("Live today");
    expect(whenLabel(1)).toBe("Live in 1 day");
    expect(whenLabel(6)).toBe("Live in 6 days");
    expect(whenLabel(-1)).toBe("Aired 1 day ago");
    expect(whenLabel(-3)).toBe("Aired 3 days ago");
  });

  it("never says Live or Aired for a date that isn't a show day", () => {
    expect(whenLabel(0, false)).toBe("Today");
    expect(whenLabel(2, false)).toBe("In 2 days");
    expect(whenLabel(-1, false)).toBe("1 day ago");
  });
});

describe("roles confirmation", () => {
  it("opens the day before the show (filming day) and stays open after", () => {
    expect(inConfirmationWindow(2)).toBe(false);
    expect(inConfirmationWindow(1)).toBe(true);
    expect(inConfirmationWindow(0)).toBe(true);
    expect(inConfirmationWindow(-5)).toBe(true);
  });

  it("is due on a filmed show day until someone confirms", () => {
    const unconfirmed = overview({ rolesConfirmation: { confirmedAt: null, confirmedBy: null } });
    expect(needsRolesConfirmation(unconfirmed, 1)).toBe(true);
    expect(needsRolesConfirmation(overview({ date: "2026-10-14" }), -2)).toBe(true);
    expect(needsRolesConfirmation(unconfirmed, 2)).toBe(false);
    expect(
      needsRolesConfirmation(overview({ rolesConfirmation: { confirmedAt: "2026-10-20T15:00:00Z", confirmedBy: "Otto" } }), 0)
    ).toBe(false);
  });

  it("still asks for an aired show the API can't place (a show only by an override, from the reminder email)", () => {
    expect(needsRolesConfirmation(overview({ date: "2026-10-15", kind: "NONE" }), -1)).toBe(true);
    expect(needsRolesConfirmation(overview({ date: "2026-10-14", kind: "HOLIDAY" }), -2)).toBe(true);
  });

  it("never asks on a coming date the calendar says isn't a show day (no reminder goes out for it)", () => {
    expect(needsRolesConfirmation(overview({ date: "2026-10-22", kind: "PA" }), 1)).toBe(false);
  });
});

describe("isShowDay", () => {
  it("trusts a non-show day only from tomorrow through the last upcoming show", () => {
    expect(isShowDay(overview(), 6)).toBe(true);
    expect(isShowDay(overview({ date: "2026-10-22", kind: "PA" }), 7)).toBe(false);
    expect(isShowDay(overview({ date: "2026-10-28", kind: "NONE" }), 13)).toBe(false);
  });

  it("counts today, aired dates and dates past the loaded shows as show days", () => {
    expect(isShowDay(overview({ date: "2026-10-15", kind: "NONE" }), 0)).toBe(true);
    expect(isShowDay(overview({ date: "2026-10-14", kind: "NONE" }), -1)).toBe(true);
    expect(isShowDay(overview({ date: "2026-10-29", kind: "NONE" }), 14)).toBe(true);
    expect(isShowDay(overview({ date: "2026-10-16", kind: "NONE", upcomingShows: [] }), 1)).toBe(true);
  });
});

describe("roleStatus and rolesSummary", () => {
  it("uses the generator's words per role", () => {
    expect(roleStatus(undefined, true)).toBe("unassigned");
    expect(roleStatus("Abby", false)).toBe("pending");
    expect(roleStatus("Abby", true)).toBe("confirmed");
  });

  it("is Unassigned until a crew role has someone", () => {
    expect(rolesSummary(overview({ confirmed: { "Backup #1": true } }))).toEqual({ tone: "neutral", label: "Unassigned" });
  });

  it("counts confirmations over the crew roles only (backups excluded)", () => {
    const partial = overview({
      assignments: { "Show Director": "Abby", Teleprompter: "Otto" },
      confirmed: { "Show Director": true, "Backup #1": true }
    });
    expect(rolesSummary(partial)).toEqual({ tone: "neutral", label: "1/3 confirmed" });

    const all = Object.fromEntries(ROLES.map((role) => [role, true]));
    const full = overview({ assignments: { "Show Director": "Abby" }, confirmed: all });
    expect(rolesSummary(full)).toEqual({ tone: "success", label: "3/3 confirmed" });
  });
});

describe("packagesTag and openSlotCount", () => {
  it("counts up to the show's limit", () => {
    expect(packagesTag(0, 2)).toEqual({ tone: "neutral", label: "0 of 2" });
    expect(packagesTag(1, 2)).toEqual({ tone: "neutral", label: "1 of 2" });
    expect(packagesTag(2, 2)).toEqual({ tone: "success", label: "Full" });
  });

  it("never shows a negative number of open slots", () => {
    expect(openSlotCount(0, 2)).toBe(2);
    expect(openSlotCount(2, 2)).toBe(0);
    expect(openSlotCount(3, 2)).toBe(0);
  });
});

describe("stripItems", () => {
  const today = new Date(2026, 9, 15, 9);

  it("lists the next shows with package counts and show managers, marking the open one", () => {
    const items = stripItems(overview(), "2026-10-23", today);
    expect(items.map((item) => item.date)).toEqual(["2026-10-21", "2026-10-23", "2026-10-28"]);
    expect(items.map((item) => item.active)).toEqual([false, true, false]);
    expect(items[0]).toMatchObject({ primary: "Wed, Oct 21", secondary: "2 packages · Otto" });
    expect(items[1].secondary).toBe("No packages");
    expect(items[2].secondary).toBe("1 package · Sage");
  });

  it("adds an aired show from an emailed link as its own cell, in date order", () => {
    const aired = overview({ date: "2026-10-14", label: "Wednesday, October 14", showManager: { name: "Sage", source: "rotation" } });
    const items = stripItems(aired, "2026-10-14", today);
    expect(items.map((item) => item.date)).toEqual(["2026-10-14", "2026-10-21", "2026-10-23", "2026-10-28"]);
    expect(items[0]).toMatchObject({ secondary: "Aired · Sage", active: true });
  });

  it("places an open future date that isn't in the list between its neighbours", () => {
    const between = overview({ date: "2026-10-26", packages: [] });
    const items = stripItems(between, "2026-10-26", today);
    expect(items.map((item) => item.date)).toEqual(["2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28"]);
    expect(items[2]).toMatchObject({ secondary: "No packages", active: true });
  });

  it("gives a lone cell (nothing to switch to) when no shows are coming up", () => {
    const lastAired = overview({ date: "2026-06-03", upcomingShows: [] });
    expect(stripItems(lastAired, "2026-06-03", today)).toHaveLength(1);
  });

  it("gives a lone cell when the open show is the only upcoming one", () => {
    const single = overview({ upcomingShows: overview().upcomingShows.slice(0, 1) });
    expect(stripItems(single, "2026-10-21", today)).toHaveLength(1);
  });
});

describe("links and titles", () => {
  it("keeps the open date across the generator round-trip", () => {
    expect(generatorHref()).toBe("/show-roles?generator=1");
    expect(generatorHref("2026-10-21")).toBe("/show-roles?generator=1&date=2026-10-21");
    expect(showHref(null)).toBe("/show-roles");
    expect(showHref("2026-10-21")).toBe("/show-roles?date=2026-10-21");
  });

  it("titles the header before a show loads from the asked-for date, if it is one", () => {
    expect(fallbackTitle()).toBe("Next show");
    expect(fallbackTitle("2026-10-21")).toBe("Wednesday, October 21");
    expect(fallbackTitle("soon")).toBe("Unknown date");
  });
});

describe("showManagerOptions", () => {
  it("keeps a hand-picked name that left the pool, first", () => {
    expect(showManagerOptions("Otto", ["Abby", "Otto"])).toEqual(["Abby", "Otto"]);
    expect(showManagerOptions("Sage", ["Abby", "Otto"])).toEqual(["Sage", "Abby", "Otto"]);
    expect(showManagerOptions("", ["Abby"])).toEqual(["Abby"]);
  });
});
