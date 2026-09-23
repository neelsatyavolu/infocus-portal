import { describe, expect, it } from "vitest";
import { tallyAnchorPaCounts } from "@/src/lib/anchor-pa-counts";

describe("tallyAnchorPaCounts", () => {
  it("counts each assigned show and PA day and keeps zeros on the roster", () => {
    const rows = tallyAnchorPaCounts({
      members: ["Abby", "Alva", "Iris"],
      anchorsByDate: {
        "2026-09-04": ["Abby", "Alva"],
        "2026-09-09": ["Abby", "Iris"]
      },
      paByDate: {
        "2026-09-08": ["Alva", "Iris"]
      }
    });

    expect(rows).toEqual([
      { name: "Abby", anchors: 2, pa: 0 },
      { name: "Alva", anchors: 1, pa: 1 },
      { name: "Iris", anchors: 1, pa: 1 }
    ]);
  });

  it("merges calendar full names onto unique roster first names", () => {
    const rows = tallyAnchorPaCounts({
      members: ["Abby", "Iris"],
      anchorsByDate: { "2026-09-04": ["Abby Chen"] },
      paByDate: { "2026-09-08": ["iris example"] }
    });

    expect(rows).toEqual([
      { name: "Abby", anchors: 1, pa: 0 },
      { name: "Iris", anchors: 0, pa: 1 }
    ]);
  });

  it("keeps unknown calendar names as their own rows", () => {
    const rows = tallyAnchorPaCounts({
      members: ["Abby"],
      anchorsByDate: { "2026-09-04": ["Guest Host"] },
      paByDate: {}
    });

    expect(rows).toEqual([
      { name: "Guest Host", anchors: 1, pa: 0 },
      { name: "Abby", anchors: 0, pa: 0 }
    ]);
  });

  it("does not merge a first name onto two roster people who share it", () => {
    const rows = tallyAnchorPaCounts({
      members: ["Abby Chen", "Abby Smith"],
      anchorsByDate: { "2026-09-04": ["Abby"] },
      paByDate: {}
    });

    expect(rows).toEqual([
      { name: "Abby", anchors: 1, pa: 0 },
      { name: "Abby Chen", anchors: 0, pa: 0 },
      { name: "Abby Smith", anchors: 0, pa: 0 }
    ]);
  });
});

describe("currentCalendarMonthKey", () => {
  it("uses Pacific time and does not go before September 2026", async () => {
    const { currentCalendarMonthKey } = await import("@/src/server/master-calendar-data");
    expect(currentCalendarMonthKey(new Date("2026-08-15T12:00:00-07:00"))).toBe("2026-09");
    expect(currentCalendarMonthKey(new Date("2026-10-01T00:30:00-07:00"))).toBe("2026-10");
  });
});
