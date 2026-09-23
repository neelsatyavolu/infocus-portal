import { describe, expect, it } from "vitest";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";
import { extractAnchorNamesFromCalendarHtml, resolveAnchorDisplayNames, refreshAnchorScriptNames } from "@/src/lib/teleprompter-anchor-names";
import { collapseTeleprompterSpokenParagraphs } from "@/src/lib/teleprompter-announcement-formatting";
import {
  TELEPROMPTER_TIME_ZONE,
  buildDefaultTeleprompterSections,
  formatShowDateForScriptLine,
  getNextShowDate,
  renderA2BulletinContent,
  renderA2UnavailableContent,
  selectAnnouncementsForBulletin
} from "@/src/lib/teleprompter-template";

function toDateKeyInTeleprompterTimeZone(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TELEPROMPTER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

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

describe("getNextShowDate", () => {
  it("returns Wednesday for Monday", () => {
    const next = getNextShowDate(new Date("2026-02-23T20:00:00.000Z"));
    expect(toDateKeyInTeleprompterTimeZone(next)).toBe("2026-02-25");
  });

  it("returns Wednesday for Tuesday", () => {
    const next = getNextShowDate(new Date("2026-02-24T20:00:00.000Z"));
    expect(toDateKeyInTeleprompterTimeZone(next)).toBe("2026-02-25");
  });

  it("returns Friday for Thursday", () => {
    const next = getNextShowDate(new Date("2026-02-26T20:00:00.000Z"));
    expect(toDateKeyInTeleprompterTimeZone(next)).toBe("2026-02-27");
  });

  it("returns next Wednesday for Friday, Saturday, and Sunday", () => {
    const friday = getNextShowDate(new Date("2026-02-27T20:00:00.000Z"));
    const saturday = getNextShowDate(new Date("2026-02-28T20:00:00.000Z"));
    const sunday = getNextShowDate(new Date("2026-03-01T20:00:00.000Z"));

    expect(toDateKeyInTeleprompterTimeZone(friday)).toBe("2026-03-04");
    expect(toDateKeyInTeleprompterTimeZone(saturday)).toBe("2026-03-04");
    expect(toDateKeyInTeleprompterTimeZone(sunday)).toBe("2026-03-04");
  });
});

describe("selectAnnouncementsForBulletin", () => {
  it("selects announcements whose show-day window includes the show, nearest last show first", () => {
    const showDate = new Date("2026-09-04T12:00:00.000Z");
    const selected = selectAnnouncementsForBulletin({
      showDate,
      announcements: [
        makeAnnouncement({
          id: "past",
          rowNumber: 5,
          startDate: "2026-08-19",
          startDateIso: "2026-08-19T12:00:00.000Z",
          endDate: "2026-08-21",
          endDateIso: "2026-08-21T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "later-show",
          rowNumber: 6,
          startDate: "2026-09-11",
          startDateIso: "2026-09-11T12:00:00.000Z",
          endDate: "2026-09-16",
          endDateIso: "2026-09-16T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "schoology",
          rowNumber: 7,
          runOn: "SCHOOLOGY_ONLY",
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-16",
          endDateIso: "2026-09-16T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "same-day-low-row",
          rowNumber: 11,
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-04",
          endDateIso: "2026-09-04T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "same-day-high-row",
          rowNumber: 20,
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-04",
          endDateIso: "2026-09-04T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "through-sep-9",
          rowNumber: 3,
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-09",
          endDateIso: "2026-09-09T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "through-sep-16",
          rowNumber: 2,
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-16",
          endDateIso: "2026-09-16T12:00:00.000Z"
        })
      ]
    });

    expect(selected.map((entry) => entry.id)).toEqual([
      "same-day-high-row",
      "same-day-low-row",
      "through-sep-9",
      "through-sep-16"
    ]);
  });

  it("returns fewer than four when there are not enough eligible rows", () => {
    const showDate = new Date("2026-09-04T12:00:00.000Z");
    const selected = selectAnnouncementsForBulletin({
      showDate,
      announcements: [
        makeAnnouncement({
          id: "one",
          rowNumber: 1,
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-04",
          endDateIso: "2026-09-04T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "two",
          rowNumber: 2,
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-09",
          endDateIso: "2026-09-09T12:00:00.000Z"
        }),
        makeAnnouncement({
          id: "past",
          rowNumber: 3,
          startDate: "2026-08-19",
          startDateIso: "2026-08-19T12:00:00.000Z",
          endDate: "2026-08-21",
          endDateIso: "2026-08-21T12:00:00.000Z"
        })
      ]
    });

    expect(selected.map((entry) => entry.id)).toEqual(["one", "two"]);
  });

  it("selects native submitted announcements whose show-day window includes the show", () => {
    const showDate = new Date("2026-09-04T12:00:00.000Z");
    const selected = selectAnnouncementsForBulletin({
      showDate,
      announcements: [
        makeAnnouncement({
          id: "native-show",
          rowNumber: Date.parse("2026-08-31T19:00:00.000Z"),
          runOn: "INFOCUS_ONLY",
          category: "InFocus only",
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-11",
          endDateIso: "2026-09-11T12:00:00.000Z",
          source: "native"
        }),
        makeAnnouncement({
          id: "native-schoology",
          rowNumber: Date.parse("2026-08-31T20:00:00.000Z"),
          runOn: "SCHOOLOGY_ONLY",
          category: "Schoology Update only",
          startDate: "2026-09-04",
          startDateIso: "2026-09-04T12:00:00.000Z",
          endDate: "2026-09-11",
          endDateIso: "2026-09-11T12:00:00.000Z",
          source: "native"
        }),
        makeAnnouncement({
          id: "sheet-outside-window",
          rowNumber: 40,
          startDate: "2026-09-16",
          startDateIso: "2026-09-16T12:00:00.000Z",
          endDate: "2026-09-18",
          endDateIso: "2026-09-18T12:00:00.000Z"
        })
      ]
    });

    expect(selected.map((entry) => entry.id)).toEqual(["native-show"]);
  });
});

describe("formatShowDateForScriptLine", () => {
  it("formats weekday, month, ordinal day, and year", () => {
    const line = formatShowDateForScriptLine(new Date("2026-03-05T12:00:00.000Z"));
    expect(line).toBe("Thursday, March 5th, 2026");
  });
});

describe("A2 rendering", () => {
  it("renders alternating camera/role blocks with announcement text", () => {
    const content = renderA2BulletinContent([
      makeAnnouncement({ announcement: " One " }),
      makeAnnouncement({ announcement: "Two" })
    ]);

    expect(content).toBe("CAM 3\n[ANCHOR]\nOne\n\nCAM 1\n[CO-ANCHOR]\nTwo");
  });

  it("renders four empty camera/role blocks when autofill is unavailable", () => {
    const content = renderA2UnavailableContent();
    expect(content).toBe(
      "CAM 3\n[ANCHOR]\n\nCAM 1\n[CO-ANCHOR]\n\nCAM 3\n[ANCHOR]\n\nCAM 1\n[CO-ANCHOR]"
    );
  });
});

describe("default section template", () => {
  it("builds A1-A5 sections with the computed date line, anchor names, and bulletin header", () => {
    const sections = buildDefaultTeleprompterSections({
      showDate: new Date("2026-03-05T12:00:00.000Z"),
      a2BulletinContent: "CAM 3\nANCHOR\nHello",
      anchorName: "Alex Kim",
      coanchorName: "Jordan Lee"
    });

    expect(sections.map((section) => section.label)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(sections[0].content).toContain("Today is Thursday, March 5th, 2026.");
    expect(sections[0].content).toContain("I'm Alex Kim.");
    expect(sections[0].content).toContain("And I'm Jordan Lee.");
    expect(sections[1].content).toBe("BULLETIN\n\nCAM 3\nANCHOR\nHello");
    expect(sections[2].content).toContain("[INSERT PACKAGE TOSS]");
    expect(sections[2].content).not.toContain("Iris Example");
    expect(sections[3].content).toContain("[INSERT THANK YOU NAMES]");
    expect(sections[3].content).not.toContain("Thanks Max");
    expect(sections[4].content).toContain("Until next time, I'm Jordan Lee.");
    expect(sections[4].content).toContain("I'm Alex Kim and this has been InFocus News.");
    expect(sections[4].content).not.toContain("Otto-Gray");
  });
});

describe("anchor parsing", () => {
  it("extracts anchor names from master calendar html", () => {
    const names = extractAnchorNamesFromCalendarHtml(
      "<p><strong>Anchors:</strong></p><p>Alex Kim</p><p>Jordan</p><p><strong>Package:</strong></p><p>Story</p>"
    );

    expect(names).toEqual(["Alex Kim", "Jordan"]);
  });

  it("resolves raw anchor names against workspace members", () => {
    const resolved = resolveAnchorDisplayNames(["Alex", "Jordan"], [
      { name: "Alex Kim" },
      { name: "Jordan Lee" }
    ]);

    expect(resolved).toEqual(["Alex Kim", "Jordan Lee"]);
  });

  it("uses legal full names when the calendar only has a first name or nickname", () => {
    const resolved = resolveAnchorDisplayNames(["Celia", "Cory"], [
      { name: "Celia Smith", nickname: "Celia" },
      { name: "Cory Jones", nickname: "Court" }
    ]);

    expect(resolved).toEqual(["Celia Smith", "Cory Jones"]);
  });
});

describe("teleprompter script reformat cleanup", () => {
  it("keeps cue lines separate while collapsing spoken lines into one paragraph", () => {
    const collapsed = collapseTeleprompterSpokenParagraphs(`CAM 3
ANCHOR
The Artruism at Paly Club, in partnership with Second Harvest of Silicon Valley, is hosting an event table during lunch on March 4 and 5.
Paly students can learn about local food insecurity, the impact of Second Harvest, and ways to help.
This comes as federal funding cuts increase strain on food banks and volunteers.

Come sign a communal thank-you poster for the Second Harvest volunteer team.
We'll also have a button-making activity for fun designs to take home.`);

    expect(collapsed).toBe(
      "CAM 3\nANCHOR\nThe Artruism at Paly Club, in partnership with Second Harvest of Silicon Valley, is hosting an event table during lunch on March 4 and 5. Paly students can learn about local food insecurity, the impact of Second Harvest, and ways to help. This comes as federal funding cuts increase strain on food banks and volunteers. Come sign a communal thank-you poster for the Second Harvest volunteer team. We'll also have a button-making activity for fun designs to take home."
    );
  });
});

describe("refreshing calendar anchor names in saved scripts", () => {
  it("updates first names and placeholders in A1/A5 while preserving edited copy", () => {
    const sections = buildDefaultTeleprompterSections({
      showDate: new Date("2026-09-09T12:00:00Z"), a2BulletinContent: "News",
      anchorName: "Alex", coanchorName: "Jordan"
    });
    const names = ["Taylor Smith", "Sam Jones"];
    const intro = sections[0].content.replace("BANTER ABOUT...", "Our custom banter.");
    const updated = refreshAnchorScriptNames("A1", intro, names);
    expect(updated).toContain("I'm Taylor Smith.");
    expect(updated).toContain("And I'm Sam Jones.");
    expect(updated).toContain("Our custom banter.");
    expect(refreshAnchorScriptNames("A1", updated, names)).toBe(updated);
    const outro = refreshAnchorScriptNames("A5", sections[4].content, names);
    expect(outro).toContain("Until next time, I'm Sam Jones.");
    expect(outro).toContain("I'm Taylor Smith and this has been InFocus News.");
    expect(outro).toContain("Follow us on social media");
    expect(refreshAnchorScriptNames("A1", updated, [])).toContain("I'm {ANCHOR NAME}.");
    expect(refreshAnchorScriptNames("A2", intro, names)).toBe(intro);
  });

  it("recognizes reformatted cue spellings and leaves unrelated spoken copy intact", () => {
    const content = "[ANCHOR]\nI'm Alex. Welcome back!\n[CO-ANCHOR]\nAnd I’m Jordan. More banter.";
    expect(refreshAnchorScriptNames("A1", content, ["Alex Kim", "Jordan Lee"]))
      .toBe("[ANCHOR]\nI'm Alex Kim. Welcome back!\n[CO-ANCHOR]\nAnd I’m Jordan Lee. More banter.");
  });
});

it("repairs a merged I am intro from AI reformatting and restores both speaker cues", () => {
  const content = "OPEN\n{ROLL INTRO}\n{HOLD}\nCAM 2\n{ANCHOR}\nGood morning, Paly. Today is Wednesday, September 9th, 2026. I am Alma, and I am Colin.";
  const updated = refreshAnchorScriptNames("A1", content, ["Alma Example", "Colin Example"]);
  expect(updated).toContain("{COANCHOR}\nToday is Wednesday, September 9th, 2026.");
  expect(updated).toContain("{ANCHOR}\nI'm Alma Example.");
  expect(updated).toContain("{COANCHOR}\nAnd I'm Colin Example.");
  expect(updated).toContain("Good morning, Paly.");
  expect(refreshAnchorScriptNames("A1", updated, ["Alma Example", "Colin Example"])).toBe(updated);
});


it("repairs the old closing to introduce Colin Baker and retains Alma's full name", () => {
  const content = "{CO ANCHOR}\nUntil next time, Colin\n{ANCHOR}\nI'm Alma and this has been InFocus News.";
  const updated = refreshAnchorScriptNames("A5", content, ["Alma Marsh", "Colin Baker"]);
  expect(updated).toBe("{CO ANCHOR}\nUntil next time, I'm Colin Baker.\n{ANCHOR}\nI'm Alma Marsh and this has been InFocus News.");
  expect(refreshAnchorScriptNames("A5", updated, ["Alma Marsh", "Colin Baker"])).toBe(updated);
  const sections = buildDefaultTeleprompterSections({ showDate: new Date("2026-09-09T12:00:00Z"), a2BulletinContent: "", anchorName: "Alma Marsh", coanchorName: "Colin Baker" });
  expect(sections[0].content).toContain("I'm Alma Marsh.");
  expect(sections[0].content).toContain("And I'm Colin Baker.");
  expect(sections[4].content).toContain("Until next time, I'm Colin Baker.");
});


it("selects PA announcements by inclusive requested dates, excluding Schoology-only and out-of-window copy", () => {
  const announcements = [
    makeAnnouncement({ id: "active", startDate: "2026-09-11", endDate: "2026-09-16" }),
    makeAnnouncement({ id: "monday", startDate: "2026-09-14", endDate: "2026-09-14" }),
    makeAnnouncement({ id: "past", startDate: "2026-09-09", endDate: "2026-09-11" }),
    makeAnnouncement({ id: "future", startDate: "2026-09-16", endDate: "2026-09-18" }),
    makeAnnouncement({ id: "schoology", startDate: "2026-09-14", endDate: "2026-09-16", runOn: "SCHOOLOGY_ONLY" })
  ];
  const params = { announcements, showDate: new Date("2026-09-14T12:00:00Z") };
  expect(selectAnnouncementsForBulletin({ ...params, pa: true }).map((item) => item.id)).toEqual(["monday", "active"]);
  expect(selectAnnouncementsForBulletin(params)).toEqual([]);
});

describe("permanent bulletin notices", () => {
  it("selects a permanent notice without date limits for both show and PA scripts", () => {
    const notice = makeAnnouncement({ id: "permanent", isPermanent: true });
    for (const pa of [false, true]) {
      expect(selectAnnouncementsForBulletin({ announcements: [notice], showDate: new Date("2026-09-16T19:00:00Z"), pa })).toEqual([notice]);
    }
  });
  it("prioritizes dated notices when script slots are limited", () => {
    const permanent = makeAnnouncement({ id: "permanent", isPermanent: true });
    const dated = makeAnnouncement({ id: "dated", startDate: "2026-09-16", endDate: "2026-09-16" });
    expect(selectAnnouncementsForBulletin({ announcements: [permanent, dated], showDate: new Date("2026-09-16T19:00:00Z"), limit: 1 })).toEqual([dated]);
  });
});
