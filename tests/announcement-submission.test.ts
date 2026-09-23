import { describe, expect, it } from "vitest";
import {
  airWindowFor,
  announcementSubmitSchema,
  formatAnnouncementCopy,
  formatAnnouncementListCopy,
  groupSubmittedAnnouncements,
  isSchoologyOnly,
  maxAnnouncementEndDate,
  showDatesInRange
} from "@/src/lib/announcement-submission";

const validPayload = {
  email: "teacher@pausd.org",
  name: "Jordan Lee",
  submitterKind: "PAUSD_EMPLOYEE",
  runOn: "BOTH",
  announcement: "The robotics showcase is this week in the quad.",
  startDate: "2026-09-04",
  endDate: "2026-09-16",
  policyAgreed: true,
  mediaLink: "https://drive.google.com/file/d/abc",
  moreInfo: "Please mention the club table."
};

describe("announcementSubmitSchema", () => {
  it("accepts a window that covers four show days", () => {
    const parsed = announcementSubmitSchema.parse(validPayload);
    expect(parsed.mediaLink).toBe("https://drive.google.com/file/d/abc");
    expect(parsed.moreInfo).toBe("Please mention the club table.");
  });

  it("rejects a fifth consecutive show day", () => {
    const result = announcementSubmitSchema.safeParse({
      ...validPayload,
      startDate: "2026-09-04",
      endDate: "2026-09-18"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "endDate")).toBe(true);
    }
  });

  it("rejects when the policy is not accepted", () => {
    const result = announcementSubmitSchema.safeParse({
      ...validPayload,
      policyAgreed: false
    });

    expect(result.success).toBe(false);
  });

  it("treats a blank media link as omitted", () => {
    const parsed = announcementSubmitSchema.parse({
      ...validPayload,
      mediaLink: "",
      moreInfo: ""
    });

    expect(parsed.mediaLink).toBeUndefined();
    expect(parsed.moreInfo).toBeUndefined();
  });
});

describe("show day window", () => {
  it("counts Wed/Fri shows and skips Labor Day week gaps", () => {
    expect(showDatesInRange("2026-09-04", "2026-09-16")).toEqual([
      "2026-09-04",
      "2026-09-09",
      "2026-09-11",
      "2026-09-16"
    ]);
    expect(maxAnnouncementEndDate("2026-09-04")).toBe("2026-09-16");
  });
});

describe("isSchoologyOnly", () => {
  it("matches native runOn and sheet category text", () => {
    expect(isSchoologyOnly({ runOn: "SCHOOLOGY_ONLY" })).toBe(true);
    expect(isSchoologyOnly({ category: "Schoology Update only" })).toBe(true);
    expect(isSchoologyOnly({ runOn: "BOTH", category: "Both" })).toBe(false);
  });
});

describe("airWindowFor", () => {
  it("labels a show day in range as will air today", () => {
    const window = airWindowFor({
      startDate: "2026-09-04",
      endDate: "2026-09-16",
      now: new Date("2026-09-04T17:00:00.000Z")
    });

    expect(window).toMatchObject({
      label: "Will air today",
      tone: "today",
      airsToday: true,
      airsTomorrow: false
    });
  });

  it("labels the next show as will air tomorrow", () => {
    const window = airWindowFor({
      startDate: "2026-09-04",
      endDate: "2026-09-16",
      now: new Date("2026-09-08T17:00:00.000Z")
    });

    expect(window).toMatchObject({
      label: "Will air tomorrow",
      tone: "tomorrow",
      airsToday: false,
      airsTomorrow: true
    });
  });

  it("labels a later show window with that show date", () => {
    const window = airWindowFor({
      startDate: "2026-09-11",
      endDate: "2026-09-16",
      now: new Date("2026-09-04T17:00:00.000Z")
    });

    expect(window.tone).toBe("upcoming");
    expect(window.label).toContain("Sep");
    expect(window.airsToday).toBe(false);
  });

  it("marks ended windows and Schoology-only rows", () => {
    expect(
      airWindowFor({
        startDate: "2026-08-10",
        endDate: "2026-08-12",
        now: new Date("2026-09-04T17:00:00.000Z")
      })
    ).toMatchObject({
      label: "Window ended",
      tone: "ended"
    });

    expect(
      airWindowFor({
        startDate: "2026-09-04",
        endDate: "2026-09-16",
        runOn: "SCHOOLOGY_ONLY",
        now: new Date("2026-09-04T17:00:00.000Z")
      })
    ).toMatchObject({
      label: "Schoology only",
      tone: "schoology",
      airsToday: false
    });
  });
});

describe("formatAnnouncementCopy", () => {
  it("trims announcement body text", () => {
    expect(formatAnnouncementCopy("  Robotics showcase in the quad.  \n")).toBe("Robotics showcase in the quad.");
  });
});

describe("formatAnnouncementListCopy", () => {
  it("joins trimmed bodies with a blank line and drops empties", () => {
    expect(formatAnnouncementListCopy(["  First.  ", "", "Second item", "   "])).toBe("First.\n\nSecond item");
  });
});

describe("groupSubmittedAnnouncements", () => {
  const fridayShow = new Date("2026-09-04T17:00:00.000Z");
  const thursdayBeforeShow = new Date("2026-09-03T17:00:00.000Z");

  it("buckets current, upcoming, schoology, and ended rows and omits empty groups", () => {
    const grouped = groupSubmittedAnnouncements(
      [
        { id: "today", startDate: "2026-09-04", endDate: "2026-09-16", runOn: "BOTH", announcement: "Airs now" },
        { id: "later", startDate: "2026-09-11", endDate: "2026-09-16", runOn: "BOTH", announcement: "Later show" },
        { id: "schoology", startDate: "2026-09-04", endDate: "2026-09-16", runOn: "SCHOOLOGY_ONLY", announcement: "Online only" },
        { id: "ended", startDate: "2026-08-10", endDate: "2026-08-12", runOn: "BOTH", announcement: "Already ran" }
      ],
      fridayShow
    );

    expect(grouped.map((bucket) => [bucket.id, bucket.entries.map((entry) => entry.id)])).toEqual([
      ["today", ["today"]],
      ["upcoming", ["later"]],
      ["schoology", ["schoology"]],
      ["ended", ["ended"]]
    ]);
  });

  it("puts a Thursday-before-show window in tomorrow, not today", () => {
    const grouped = groupSubmittedAnnouncements(
      [{ id: "next", startDate: "2026-09-04", endDate: "2026-09-16", runOn: "BOTH", announcement: "Friday show" }],
      thursdayBeforeShow
    );

    expect(grouped.map((bucket) => bucket.id)).toEqual(["tomorrow"]);
  });
});

describe("permanent announcements", () => {
  it("keeps notices in a permanent section after ordinary dates expire", () => {
    const notice = { isPermanent: true, startDate: "2026-09-04", endDate: "2026-09-04" };
    expect(groupSubmittedAnnouncements([notice], new Date("2026-09-16T19:00:00Z"))[0].id).toBe("permanent");
    expect(airWindowFor({ ...notice, now: new Date("2026-09-16T19:00:00Z") }).airsToday).toBe(true);
  });
});
