import { describe, expect, it } from "vitest";
import {
  ANCHOR_MODE_RANDOM,
  ANCHOR_MODE_VOLUNTEER,
  anchorModeForDate,
  hasSufficientAnchorNotice,
  isVolunteerWeek,
  monthKey,
  randomAnchorCandidates,
  randomPaCandidates,
  suggestRandomAnchors,
  weekOfMonth
} from "@/src/show-roles/lib/anchors";
import { getSuggestedAnchors } from "@/src/show-roles/lib/assignments";

describe("week of month", () => {
  it("buckets days 1-7 into week 1 and 8-14 into week 2", () => {
    expect(weekOfMonth(new Date("2026-09-01T12:00:00"))).toBe(1);
    expect(weekOfMonth(new Date("2026-09-07T12:00:00"))).toBe(1);
    expect(weekOfMonth(new Date("2026-09-08T12:00:00"))).toBe(2);
    expect(weekOfMonth(new Date("2026-09-15T12:00:00"))).toBe(3);
    expect(weekOfMonth(new Date("2026-09-22T12:00:00"))).toBe(4);
  });

  it("builds a stable month key", () => {
    expect(monthKey(new Date("2026-09-08T12:00:00"))).toBe("2026-09");
    expect(monthKey(new Date("2026-12-31T12:00:00"))).toBe("2026-12");
  });
});

describe("anchor mode by week", () => {
  it("uses volunteers in weeks 1 and 4", () => {
    expect(anchorModeForDate(new Date("2026-09-02T12:00:00"))).toBe(ANCHOR_MODE_VOLUNTEER);
    expect(anchorModeForDate(new Date("2026-09-24T12:00:00"))).toBe(ANCHOR_MODE_VOLUNTEER);
    expect(isVolunteerWeek(new Date("2026-09-02T12:00:00"))).toBe(true);
  });

  it("uses random selection in weeks 2 and 3", () => {
    expect(anchorModeForDate(new Date("2026-09-09T12:00:00"))).toBe(ANCHOR_MODE_RANDOM);
    expect(anchorModeForDate(new Date("2026-09-16T12:00:00"))).toBe(ANCHOR_MODE_RANDOM);
    expect(isVolunteerWeek(new Date("2026-09-16T12:00:00"))).toBe(false);
  });

  it("treats a trailing fifth week as a volunteer week", () => {
    // A 31-day month spills past day 28; those days stay with the week-4 rule.
    expect(anchorModeForDate(new Date("2026-10-30T12:00:00"))).toBe(ANCHOR_MODE_VOLUNTEER);
  });
});

describe("random selection pool", () => {
  const members = ["Abby", "Otto", "Sage", "Kira", "Lucas"];

  it("excludes this month's volunteers", () => {
    const candidates = randomAnchorCandidates({
      members,
      monthVolunteers: ["Abby", "Otto"]
    });

    expect(candidates).toEqual(["Sage", "Kira", "Lucas"]);
  });

  it("also excludes non-anchors and exempt producers", () => {
    const candidates = randomAnchorCandidates({
      members,
      monthVolunteers: ["Abby"],
      nonAnchors: ["Sage"],
      exempt: ["Lucas"]
    });

    expect(candidates).toEqual(["Otto", "Kira"]);
  });

  it("excludes anyone who already anchored this month", () => {
    const candidates = randomAnchorCandidates({
      members,
      monthAnchors: ["Otto", "Kira"]
    });

    expect(candidates).toEqual(["Abby", "Sage", "Lucas"]);
  });

  it("excludes people who just did PA before this show", () => {
    const candidates = randomAnchorCandidates({
      members,
      recentPaAnnouncers: ["Abby", "Lucas"]
    });

    expect(candidates).toEqual(["Otto", "Sage", "Kira"]);
  });

  it("returns everyone when nothing is blocked", () => {
    expect(randomAnchorCandidates({ members })).toEqual(members);
  });
});

describe("PA announcer pool", () => {
  it("uses people who are not anchoring this month", () => {
    expect(
      randomPaCandidates({
        members: ["Abby", "Otto", "Sage", "Kira"],
        monthAnchors: ["Abby", "Otto"]
      })
    ).toEqual(["Sage", "Kira"]);
  });
});

describe("suggestions", () => {
  const history = [
    { name: "Abby", isNonAnchor: false, isExempt: false },
    { name: "Otto", isNonAnchor: false, isExempt: false },
    { name: "Sage", isNonAnchor: false, isExempt: false },
    { name: "Neel", isNonAnchor: false, isExempt: true }
  ];

  it("shuffles the eligible pool instead of taking names in list or A-Z order", () => {
    const picked = suggestRandomAnchors({
      anchorHistoryRows: history,
      monthVolunteers: ["Abby"],
      random: () => 0
    });
    expect(picked).toHaveLength(2);
    expect(picked).not.toContain("Abby");
    expect(picked).not.toContain("Neel");
    expect(new Set(picked)).toEqual(new Set(["Sage", "Otto"]));
    expect(picked).not.toEqual(["Otto", "Sage"]);
  });

  it("does not suggest someone who already anchored this month", () => {
    const picked = suggestRandomAnchors({
      anchorHistoryRows: history,
      monthAnchors: ["Otto"],
      random: () => 0.99
    });
    expect(picked).toHaveLength(2);
    expect(picked).not.toContain("Otto");
    expect(picked).not.toContain("Neel");
    expect(new Set(picked)).toEqual(new Set(["Abby", "Sage"]));
  });

  it("never suggests exempt producers", () => {
    expect(
      suggestRandomAnchors({ anchorHistoryRows: history, monthVolunteers: [], count: 4 })
    ).not.toContain("Neel");
  });

  it("keeps getSuggestedAnchors filtering this month's volunteers too", () => {
    expect(getSuggestedAnchors(history, 2, ["Abby", "Otto"])).toEqual(["Sage"]);
    const pair = getSuggestedAnchors(history, 2);
    expect(pair).toHaveLength(2);
    expect(pair).not.toContain("Neel");
    expect(new Set(pair).size).toBe(2);
  });
});

describe("48-hour anchor notice", () => {
  const show = new Date("2026-09-10T09:00:00.000Z");

  it("accepts notice given more than 48 hours out", () => {
    expect(hasSufficientAnchorNotice(show, new Date("2026-09-08T08:00:00.000Z"))).toBe(true);
  });

  it("rejects late notice", () => {
    expect(hasSufficientAnchorNotice(show, new Date("2026-09-09T09:00:00.000Z"))).toBe(false);
  });

  it("treats exactly 48 hours as sufficient", () => {
    expect(hasSufficientAnchorNotice(show, new Date("2026-09-08T09:00:00.000Z"))).toBe(true);
  });

  it("rejects missing dates", () => {
    expect(hasSufficientAnchorNotice(null, new Date())).toBe(false);
    expect(hasSufficientAnchorNotice(show, null)).toBe(false);
  });
});
