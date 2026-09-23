import { describe, expect, it } from "vitest";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";
import {
  COLLEGE_VISIT_RSVP_LINE,
  draftCollegeVisitAnnouncement,
  formatSpokenClock,
  isCollegeVisitAnnouncementText,
  isOnCampusCollegeVisit,
  mergeCollegeVisitIntoBulletin,
  parseCollegeVisitDate,
  parseCollegeVisitRows,
  shouldSkipCollegeVisitSheet,
  visitsInShowWindow
} from "@/src/lib/college-visits";
import { getNextShowDate } from "@/src/lib/teleprompter-template";

function makeAnnouncement(overrides: Partial<SubmittedAnnouncement>): SubmittedAnnouncement {
  return {
    id: "row-1",
    rowNumber: 1,
    timestamp: "",
    timestampIso: null,
    name: "",
    email: "",
    category: "",
    submitterKind: "",
    runOn: "",
    announcement: "Announcement",
    startDate: "",
    startDateIso: null,
    endDate: "",
    endDateIso: null,
    mediaLink: "",
    moreInfo: "",
    source: "google-sheets",
    ...overrides
  };
}

const sheetRows = [
  ["Note: some of the entries in the College Visit list are off campus."],
  ["College", "Rep/Topic", "Paly/Off Campus", "Date", "Time"],
  ["Week of Aug. 31"],
  ["University of Chicago", "Rep visit", "Paly CCC", "9/1/26", "9:05 AM"],
  ["Reed College", "Rep visit", "Paly CCC", "9/1/26", "10:45 AM"],
  ["University of Calgary", "Rep visit", "Paly CCC", "9/2/26", "10:05 AM"],
  ["Financial Aid 101(Virtual Workshop)", "Online", "Virtual Zoom", "8/26/26", "3:00 PM"],
  ["Week of Sept 7"],
  ["Wake Forest University", "Rep visit", "Paly CCC", "9/8/2026", "9:05 AM"],
  ["Occidental College", "Rep visit", "Paly CCC", "9/8/2026", "9:50 AM"],
  ["New York University Abu Dhabi", "Rep visit", "Paly CCC", "9/9/2026", "9:05 AM"],
  ["Case Western Reserve University", "Rep visit", "Paly CCC", "9/9/2026", "9:50 AM"],
  ["University of Ottawa", "Rep visit", "Paly CCC", "9/9/2026", "11:35 AM"],
  ["Oregon State University", "Rep visit", "Paly CCC", "9/9/2026", "1:45 PM"],
  ["Sarah Lawrence College", "Rep visit", "Paly CCC", "9/10/2026", "10:45 AM"],
  ["Notre Dame, WashU, Hopkins, and Emory", "off campus info session", "San Francisco Airport Marriott", "9/10/23", "1:00 PM"]
];

describe("college visit sheet parsing", () => {
  it("parses slash dates with 2-digit and 4-digit years", () => {
    expect(parseCollegeVisitDate("9/8/26")).toBe("2026-09-08");
    expect(parseCollegeVisitDate("9/8/2026")).toBe("2026-09-08");
    expect(parseCollegeVisitDate("2026-09-08")).toBe("2026-09-08");
    expect(parseCollegeVisitDate("Week of Sept 7")).toBeNull();
  });

  it("keeps Paly campus visits and skips virtual or off-campus rows", () => {
    expect(isOnCampusCollegeVisit("Paly CCC")).toBe(true);
    expect(isOnCampusCollegeVisit("Paly C&CC")).toBe(true);
    expect(isOnCampusCollegeVisit("Virtual Zoom")).toBe(false);
    expect(isOnCampusCollegeVisit("Off campus")).toBe(false);
  });

  it("skips the Sample tab", () => {
    expect(shouldSkipCollegeVisitSheet("Sample")).toBe(true);
    expect(shouldSkipCollegeVisitSheet("Week of Aug. 31")).toBe(false);
  });

  it("parses visit rows and dedupes repeats", () => {
    const visits = parseCollegeVisitRows([
      ...sheetRows,
      ["Wake Forest University", "Rep visit", "Paly CCC", "9/8/2026", "9:05 AM"]
    ]);

    expect(visits.some((visit) => visit.college === "Wake Forest University")).toBe(true);
    expect(visits.filter((visit) => visit.college === "Wake Forest University")).toHaveLength(1);
    expect(visits.some((visit) => visit.college === "College")).toBe(false);
    expect(visits.some((visit) => visit.college.startsWith("Week of"))).toBe(false);
  });
});

describe("college visit show window", () => {
  it("keeps on-campus visits between this show and the next show", () => {
    const showDate = new Date("2026-09-04T12:00:00.000Z");
    const nextShow = getNextShowDate(showDate);
    expect(nextShow.toISOString().slice(0, 10)).toBe("2026-09-09");

    const inWindow = visitsInShowWindow(parseCollegeVisitRows(sheetRows), "2026-09-04", "2026-09-09");

    expect(inWindow.map((visit) => visit.college)).toEqual(["Wake Forest University", "Occidental College"]);
  });

  it("excludes the next show day so those visits air on that show", () => {
    const inWindow = visitsInShowWindow(parseCollegeVisitRows(sheetRows), "2026-09-09", "2026-09-11");
    expect(inWindow.map((visit) => visit.college)).toEqual([
      "New York University Abu Dhabi",
      "Case Western Reserve University",
      "University of Ottawa",
      "Oregon State University",
      "Sarah Lawrence College"
    ]);
  });
});

describe("college visit bulletin copy", () => {
  it("names a few visits in spoken sentences instead of a colon list", () => {
    const text = draftCollegeVisitAnnouncement(
      visitsInShowWindow(parseCollegeVisitRows(sheetRows), "2026-09-04", "2026-09-09"),
      "2026-09-04"
    );

    expect(text).toContain("Wake Forest University and Occidental College will be visiting the College and Career Center on Tuesday.");
    expect(text).toContain("Wake Forest University is at 9:05 a.m. and Occidental College is at 9:50 a.m.");
    expect(text).toContain(COLLEGE_VISIT_RSVP_LINE);
    expect(text).not.toMatch(/Upcoming college visits:/i);
  });

  it("keeps every college grouped by day in a crowded window without individual times", () => {
    const text = draftCollegeVisitAnnouncement(
      visitsInShowWindow(parseCollegeVisitRows(sheetRows), "2026-09-09", "2026-09-11"),
      "2026-09-09"
    );

    expect(text).toBe(
      "College visits are happening today and tomorrow in the College and Career Center. Today’s visitors are New York University Abu Dhabi, Case Western Reserve University, University of Ottawa, and Oregon State University. Tomorrow’s visitors are Sarah Lawrence College. Check MaiaLearning through ClassLink under Events for visit times and to RSVP."
    );
    expect(text).not.toContain("9:05");
  });

  it("returns null when there are no visits in the window", () => {
    expect(draftCollegeVisitAnnouncement([], "2026-09-04")).toBeNull();
  });

  it("formats clocks for teleprompter reading", () => {
    expect(formatSpokenClock("9:05 AM")).toBe("9:05 a.m.");
    expect(formatSpokenClock("11:30 am")).toBe("11:30 a.m.");
    expect(formatSpokenClock("2:30 PM")).toBe("2:30 p.m.");
  });
});

describe("mergeCollegeVisitIntoBulletin", () => {
  it.each(["rep", "representative"])("replaces stale college %s visits with the current sheet bulletin", (word) => {
    const collegeVisit = makeAnnouncement({
      id: "college-visits-2026-09-21",
      announcement: "College visits are happening tomorrow in the College and Career Center."
    });
    const scholarship = makeAnnouncement({ id: "scholarships", announcement: "View scholarships online." });
    const merged = mergeCollegeVisitIntoBulletin([
      makeAnnouncement({
        id: "submitted-visits",
        announcement: `College ${word} visits are coming up. Columbia University will be here Tuesday, September 15th. Oberlin College Conservatory of Music will visit on Friday, September 18th. Columbia University's Dual Degree Programs will be here Thursday, September 24th.`
      }),
      scholarship
    ], collegeVisit);

    expect(merged).toEqual([collegeVisit, scholarship]);
  });

  it("prepends the sheet visit and drops submitted college-visit lists", () => {
    const collegeVisit = makeAnnouncement({
      id: "college-visits-2026-09-04",
      announcement: "Wake Forest University will be visiting the College and Career Center on Tuesday."
    });
    const merged = mergeCollegeVisitIntoBulletin(
      [
        makeAnnouncement({
          id: "submitted-visits",
          announcement:
            "Upcoming college visits: Columbia University on Sept. 15 at 11:30 am, Columbia Dual Degree programs on Sept. 24 at 2:30 pm, and Arizona State University California campus on Nov. 3 at 10:45 am."
        }),
        makeAnnouncement({ id: "nui", announcement: "Join the New Urbanism Initiative." }),
        makeAnnouncement({ id: "math", announcement: "Buddies4Math needs volunteers." }),
        makeAnnouncement({ id: "scholarships", announcement: "View scholarships online." })
      ],
      collegeVisit
    );

    expect(merged.map((entry) => entry.id)).toEqual(["college-visits-2026-09-04", "nui", "math", "scholarships"]);
    expect(
      isCollegeVisitAnnouncementText(
        "Upcoming college visits: Columbia University on Sept. 15 at 11:30 am."
      )
    ).toBe(true);
  });

  it("leaves the selected bulletin unchanged when no sheet visits fall in the window", () => {
    const selected = [makeAnnouncement({ id: "nui" })];
    expect(mergeCollegeVisitIntoBulletin(selected, null)).toEqual(selected);
  });
});
