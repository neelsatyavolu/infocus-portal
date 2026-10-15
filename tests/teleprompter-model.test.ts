import { describe, expect, it } from "vitest";
import {
  RECENT_DOCS_LIMIT,
  codeColumnCh,
  countSectionsToFill,
  formatAge,
  formatShowDateLong,
  headerShowLine,
  latestDocUpdate,
  primaryDocStatus,
  railDateParts,
  sectionStatus,
  showDateKey,
  sortDocsByRecent,
  splitPlaceholders,
  splitSectionLabel,
  todayDateKey,
  visibleRailDocs,
  workspaceLayout,
  type TeleprompterDoc,
  type TeleprompterSection
} from "@/app/(app)/teleprompter/teleprompter-model";

const STAMP = "2026-10-01T12:00:00.000Z";

function section(overrides: Partial<TeleprompterSection> = {}): TeleprompterSection {
  return {
    id: overrides.id ?? "s1",
    label: "A1",
    content: "ANCHOR: Good morning everyone.",
    orderIndex: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides
  };
}

function doc(overrides: Partial<TeleprompterDoc> = {}): TeleprompterDoc {
  return {
    id: overrides.id ?? "d1",
    title: "InFocus Show - 10/21/2026",
    orderIndex: 0,
    showDate: "2026-10-21T12:00:00.000Z",
    createdAt: STAMP,
    updatedAt: STAMP,
    sections: [section()],
    ...overrides
  };
}

describe("workspaceLayout", () => {
  it("assumes the split desktop layout before the first measurement", () => {
    expect(workspaceLayout(null, false)).toEqual({
      mode: "split",
      railInline: true,
      rundownColumn: false,
      compactToolbar: true,
      phone: false
    });
  });

  it("adds the Rundown column from 80rem and keeps full toolbar buttons when there is room", () => {
    expect(workspaceLayout(1400, false)).toMatchObject({ mode: "split", railInline: true, rundownColumn: true, compactToolbar: false });
  });

  it("hides the rail when collapsed, giving the script its width back", () => {
    expect(workspaceLayout(1000, true)).toMatchObject({ mode: "split", railInline: false, compactToolbar: false });
  });

  it("switches to the narrow layout below 56rem and to phone below 600px", () => {
    expect(workspaceLayout(700, false)).toMatchObject({ mode: "narrow", railInline: false, rundownColumn: false, phone: false });
    expect(workspaceLayout(360, false)).toMatchObject({ mode: "narrow", phone: true, compactToolbar: false });
  });
});

describe("primaryDocStatus", () => {
  const context = { todayKey: "2026-10-16", nextShowKey: "2026-10-21" };
  const toFill = section({ id: "s2", content: "[INSERT PACKAGE TOSS]" });

  it("prefers Today, then Next show, then To fill, then No sections", () => {
    expect(primaryDocStatus(doc({ showDate: "2026-10-16T12:00:00.000Z", sections: [toFill] }), context)?.kind).toBe("today");
    expect(primaryDocStatus(doc({ sections: [toFill] }), context)?.kind).toBe("next-show");
    expect(primaryDocStatus(doc({ showDate: "2026-10-09T12:00:00.000Z", sections: [toFill] }), context)).toEqual({
      kind: "to-fill",
      label: "To fill · 1",
      tone: "warning"
    });
    expect(primaryDocStatus(doc({ showDate: "2026-10-09T12:00:00.000Z", sections: [] }), context)?.kind).toBe("no-sections");
    expect(primaryDocStatus(doc({ showDate: "2026-10-09T12:00:00.000Z" }), context)).toBeNull();
  });

  it("drops Next show when the page was opened for a chosen date", () => {
    expect(primaryDocStatus(doc(), { todayKey: "2026-10-16", nextShowKey: null })).toBeNull();
  });
});

describe("headerShowLine", () => {
  const today = doc({ id: "today", showDate: "2026-10-21T12:00:00.000Z" });
  const next = doc({ id: "next", showDate: "2026-10-23T12:00:00.000Z" });
  const base = { requestedShowDate: "", nextShowDateIso: "2026-10-23T12:00:00.000Z", todayKey: "2026-10-21" };

  it("names today's show on a show day when today's script exists", () => {
    expect(headerShowLine({ ...base, docs: [next, today] })).toEqual({ lead: "Today's show ·", date: "Wed, Oct 21" });
  });

  it("names the next show when there is no script for today", () => {
    expect(headerShowLine({ ...base, docs: [next] })).toEqual({ lead: "Next show", date: "Fri, Oct 23" });
  });

  it("names the chosen date when the page was opened with ?showDate", () => {
    expect(
      headerShowLine({ ...base, requestedShowDate: "2026-10-23", docs: [today, next] })
    ).toEqual({ lead: "Show on", date: "Fri, Oct 23" });
  });

  it("returns null without a usable next show date and no script for today", () => {
    expect(headerShowLine({ ...base, nextShowDateIso: "", docs: [next] })).toBeNull();
  });
});

describe("visibleRailDocs", () => {
  const docs = Array.from({ length: 12 }, (_, index) => doc({ id: `d${index}` }));

  it("shows everything up to the limit", () => {
    expect(visibleRailDocs(docs.slice(0, RECENT_DOCS_LIMIT), false, null)).toEqual({ visible: docs.slice(0, RECENT_DOCS_LIMIT), hiddenCount: 0 });
  });

  it("shows the first nine and counts the rest", () => {
    const result = visibleRailDocs(docs, false, "d0");
    expect(result.visible.map((entry) => entry.id)).toEqual(docs.slice(0, 9).map((entry) => entry.id));
    expect(result.hiddenCount).toBe(3);
  });

  it("keeps a selected script further down visible", () => {
    const result = visibleRailDocs(docs, false, "d11");
    expect(result.visible.at(-1)?.id).toBe("d11");
    expect(result.visible).toHaveLength(10);
    expect(result.hiddenCount).toBe(2);
  });

  it("shows all when expanded", () => {
    expect(visibleRailDocs(docs, true, "d11")).toEqual({ visible: docs, hiddenCount: 0 });
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-10-15T12:00:00.000Z");

  it("reads now, minutes, hours and days", () => {
    expect(formatAge(0, now)).toBe("");
    expect(formatAge(now - 20_000, now)).toBe("now");
    expect(formatAge(now - 5 * 60_000, now)).toBe("5m");
    expect(formatAge(now - 3 * 3_600_000, now)).toBe("3h");
    expect(formatAge(now - 2 * 86_400_000, now)).toBe("2d");
  });

  it("falls back to a short date after a week", () => {
    expect(formatAge(now - 10 * 86_400_000, now)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("never reads negative for a timestamp in the future", () => {
    expect(formatAge(now + 60_000, now)).toBe("now");
  });
});

describe("splitSectionLabel", () => {
  it("splits a beat heading off as the beat name", () => {
    expect(splitSectionLabel({ label: "A1", content: "OPEN\n\nANCHOR: Hi." })).toEqual({ code: "A1", beat: "Open", content: "ANCHOR: Hi." });
  });

  it("keeps labels with hyphens whole", () => {
    expect(splitSectionLabel({ label: "A2 - B", content: "BULLETIN\nText" })).toMatchObject({ code: "A2 - B", beat: "Bulletin" });
  });

  it("has no beat without a heading", () => {
    expect(splitSectionLabel({ label: "B1", content: "ANCHOR: Hi." })).toEqual({ code: "B1", beat: null, content: "ANCHOR: Hi." });
  });
});

describe("section status and placeholders", () => {
  it("marks empty sections, including a heading with no text", () => {
    expect(sectionStatus(section({ content: "   " }))).toBe("empty");
    expect(sectionStatus(section({ content: "CLOSING" }))).toBe("empty");
  });

  it("marks sections that still hold an [INSERT …] placeholder", () => {
    expect(sectionStatus(section({ content: "PACKAGE\n[insert package toss: Robotics]" }))).toBe("to-fill");
    expect(sectionStatus(section())).toBeNull();
  });

  it("counts sections to fill", () => {
    expect(
      countSectionsToFill(
        doc({ sections: [section({ id: "a", content: "[INSERT THANK YOU NAMES]" }), section({ id: "b" }), section({ id: "c", content: "[INSERT PACKAGE TOSS]" })] })
      )
    ).toBe(2);
  });

  it("splits text into plain runs and placeholders", () => {
    expect(splitPlaceholders("Thanks to [INSERT THANK YOU NAMES] today.")).toEqual([
      { text: "Thanks to ", placeholder: false },
      { text: "[INSERT THANK YOU NAMES]", placeholder: true },
      { text: " today.", placeholder: false }
    ]);
    expect(splitPlaceholders("No placeholders")).toEqual([{ text: "No placeholders", placeholder: false }]);
  });
});

describe("codeColumnCh", () => {
  it("fits the longest label between 2 and 10 characters", () => {
    expect(codeColumnCh([])).toBe(2);
    expect(codeColumnCh([{ label: "A1" }, { label: "A10" }])).toBe(3);
    expect(codeColumnCh([{ label: "A very long section label" }])).toBe(10);
  });
});

describe("dates", () => {
  it("reads today in the show calendar's time zone", () => {
    expect(todayDateKey(new Date("2026-10-15T06:00:00.000Z"))).toBe("2026-10-14");
    expect(todayDateKey(new Date("2026-10-15T20:00:00.000Z"))).toBe("2026-10-15");
  });

  it("formats show dates from the date key, not the local time zone", () => {
    expect(showDateKey("2026-10-21T00:00:00.000Z")).toBe("2026-10-21");
    expect(showDateKey("not a date")).toBeNull();
    expect(formatShowDateLong("2026-10-21T00:00:00.000Z")).toBe("Wed, Oct 21");
    expect(railDateParts("2026-10-21T00:00:00.000Z")).toEqual({ weekday: "WED", date: "10/21" });
    expect(railDateParts(null)).toBeNull();
  });
});

describe("ordering and updates", () => {
  it("sorts by show date, newest first, then by creation", () => {
    const older = doc({ id: "older", showDate: "2026-10-09T12:00:00.000Z" });
    const newer = doc({ id: "newer", showDate: "2026-10-21T12:00:00.000Z" });
    const undated = doc({ id: "undated", showDate: null, createdAt: "2026-10-14T12:00:00.000Z" });
    expect(sortDocsByRecent([older, undated, newer]).map((entry) => entry.id)).toEqual(["newer", "undated", "older"]);
  });

  it("takes the newest change across the script and its sections", () => {
    const later = "2026-10-03T12:00:00.000Z";
    expect(latestDocUpdate(doc({ sections: [section({ updatedAt: later })] }))).toBe(Date.parse(later));
  });
});
