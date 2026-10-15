import { describe, expect, it } from "vitest";
import {
  createProjectErrorMessage,
  dashboardHref,
  extensionsTone,
  formatDueTagLabel,
  formatHours,
  formatShortDueDate,
  isValidProjectName,
  normalizeSort,
  normalizeView,
  packagePeopleLine,
  plural,
  shortStageLabel,
  stageDueDays,
  stageDueTone
} from "@/components/home/home-format";
import { formatStageDueLabel } from "@/src/server/dashboard-data";

// 00:30 Pacific on Aug 13 (07:30 UTC), as in dashboard-stage-due.test.ts.
const NOW = new Date("2026-08-13T07:30:00.000Z");

function dueInDays(days: number) {
  return new Date(Date.UTC(2026, 7, 13 + days)).toISOString();
}

describe("normalizeSort / normalizeView", () => {
  it("keeps known values and falls back to name / grid", () => {
    expect(normalizeSort("recent")).toBe("recent");
    expect(normalizeSort("size")).toBe("size");
    expect(normalizeSort("name")).toBe("name");
    expect(normalizeSort(undefined)).toBe("name");
    expect(normalizeSort("bogus")).toBe("name");
    expect(normalizeView("list")).toBe("list");
    expect(normalizeView("grid")).toBe("grid");
    expect(normalizeView(undefined)).toBe("grid");
    expect(normalizeView("table")).toBe("grid");
  });
});

describe("dashboardHref", () => {
  it("keeps workspace, sort and view in the URL", () => {
    expect(dashboardHref({ workspaceId: "ws_1", sort: "recent", view: "list" })).toBe(
      "/dashboard?workspaceId=ws_1&sort=recent&view=list"
    );
  });

  it("encodes the workspace id", () => {
    expect(dashboardHref({ workspaceId: "a b&c", sort: "name", view: "grid" })).toBe(
      "/dashboard?workspaceId=a+b%26c&sort=name&view=grid"
    );
  });
});

describe("shortStageLabel", () => {
  it("shortens every stage for buttons and the stage strip", () => {
    expect(shortStageLabel("proofOfContact")).toBe("Brainstorming");
    expect(shortStageLabel("aRollBRoll")).toBe("A-roll / B-roll");
    expect(shortStageLabel("initialCut")).toBe("Initial Cut");
    expect(shortStageLabel("finalCut")).toBe("Final Cut");
  });
});

describe("stageDueDays / stageDueTone", () => {
  it("counts whole days from today in Pacific time", () => {
    expect(stageDueDays(dueInDays(0), NOW)).toBe(0);
    expect(stageDueDays(dueInDays(2), NOW)).toBe(2);
    expect(stageDueDays(dueInDays(-1), NOW)).toBe(-1);
    // 19:00 Pacific on Sep 29 is already Sep 30 in UTC; the due day is still today.
    expect(stageDueDays("2026-09-29T00:00:00.000Z", new Date("2026-09-30T02:00:00.000Z"))).toBe(0);
  });

  it("returns null for missing or invalid dates", () => {
    expect(stageDueDays(null, NOW)).toBeNull();
    expect(stageDueDays("not-a-date", NOW)).toBeNull();
  });

  it("is danger when past, warning through two days out, neutral after", () => {
    expect(stageDueTone(-3)).toBe("danger");
    expect(stageDueTone(-1)).toBe("danger");
    expect(stageDueTone(0)).toBe("warning");
    expect(stageDueTone(2)).toBe("warning");
    expect(stageDueTone(3)).toBe("neutral");
    expect(stageDueTone(null)).toBe("neutral");
  });

  it("agrees with formatStageDueLabel, so the tag's color and words never disagree", () => {
    for (let days = -10; days <= 30; days += 1) {
      const due = dueInDays(days);
      const counted = stageDueDays(due, NOW);
      const label = formatStageDueLabel(due, NOW) ?? "";
      expect(counted).toBe(days);
      if (days === 0) expect(label).toMatch(/· today$/);
      if (days > 0) expect(label).toMatch(new RegExp(`· in ${days} days?$`));
      if (days < 0) expect(label).toMatch(new RegExp(`· ${-days} days? ago$`));
    }
  });
});

describe("formatShortDueDate", () => {
  it("prints the stored due day without the countdown", () => {
    expect(formatShortDueDate("2026-10-16T00:00:00.000Z")).toBe("Oct 16");
    expect(formatShortDueDate(null)).toBeNull();
    expect(formatShortDueDate("not-a-date")).toBeNull();
  });

  it("matches the date inside formatStageDueLabel", () => {
    const due = dueInDays(3);
    expect(formatStageDueLabel(due, NOW)).toContain(`Due ${formatShortDueDate(due)} ·`);
  });
});

describe("formatDueTagLabel", () => {
  it("prints the date with the kit's countdown words", () => {
    expect(formatDueTagLabel(dueInDays(2), NOW)).toBe(`Due ${formatShortDueDate(dueInDays(2))} · in 2d`);
    expect(formatDueTagLabel(dueInDays(0), NOW)).toBe(`Due ${formatShortDueDate(dueInDays(0))} · Today`);
    expect(formatDueTagLabel(dueInDays(-3), NOW)).toBe(`Due ${formatShortDueDate(dueInDays(-3))} · 3d ago`);
  });

  it("returns null for missing or invalid dates", () => {
    expect(formatDueTagLabel(null, NOW)).toBeNull();
    expect(formatDueTagLabel("not-a-date", NOW)).toBeNull();
  });
});

describe("extensionsTone", () => {
  it("warns at zero days left and is danger when overdrawn", () => {
    expect(extensionsTone(2)).toBeUndefined();
    expect(extensionsTone(0)).toBe("warning");
    expect(extensionsTone(-1)).toBe("danger");
  });
});

describe("plural / formatHours", () => {
  it("pluralizes by count", () => {
    expect(plural(1, "project")).toBe("1 project");
    expect(plural(0, "project")).toBe("0 projects");
    expect(plural(2, "media file")).toBe("2 media files");
    expect(plural(3, "person", "people")).toBe("3 people");
  });

  it("keeps whole hours whole and rounds the rest to one decimal", () => {
    expect(formatHours(4)).toBe("4");
    expect(formatHours(2.25)).toBe("2.3");
  });
});

describe("packagePeopleLine", () => {
  it("lists the whole roster, then the producer", () => {
    expect(packagePeopleLine({ memberNames: ["Abby", "Otto", "Sage"], producerName: "Rowan" })).toBe(
      "Abby, Otto, Sage · Producer: Rowan"
    );
  });

  it("says when no producer is assigned and skips blank names", () => {
    expect(packagePeopleLine({ memberNames: ["Abby", "", "Otto"], producerName: null })).toBe(
      "Abby, Otto · No producer assigned"
    );
    expect(packagePeopleLine({ memberNames: [], producerName: null })).toBe("No producer assigned");
  });
});

describe("isValidProjectName / createProjectErrorMessage", () => {
  it("uses the same 2–120 trimmed bounds as POST /api/projects", () => {
    expect(isValidProjectName("")).toBe(false);
    expect(isValidProjectName(" a ")).toBe(false);
    expect(isValidProjectName("ab")).toBe(true);
    expect(isValidProjectName(`  ${"x".repeat(120)}  `)).toBe(true);
    expect(isValidProjectName("x".repeat(121))).toBe(false);
  });

  it("explains validation and role failures, and falls back to a retry message", () => {
    expect(createProjectErrorMessage(400)).toBe("Use 2–120 characters.");
    expect(createProjectErrorMessage(403)).toBe("Only workspace owners and editors can add projects.");
    expect(createProjectErrorMessage(500)).toBe("Couldn't create the project. Try again.");
    expect(createProjectErrorMessage(0)).toBe("Couldn't create the project. Try again.");
  });
});
