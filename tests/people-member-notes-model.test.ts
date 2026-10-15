import { describe, expect, it } from "vitest";
import {
  coverageLabel,
  isMembersLayout,
  isNoteFilter,
  missingCyclesText,
  notesFromMembers,
  parseNoteKey,
  personLabel,
  rebaseNotes,
  tabDescription,
  tabTitle,
  tabsWithNotes,
  withSavedNotes,
  type MembersPayload
} from "@/app/(app)/members/member-notes-model";

const payload: MembersPayload = {
  cycles: [
    { cycleNumber: 1, focus: "Campus food" },
    { cycleNumber: 2, focus: "" }
  ],
  members: [
    { id: "abby", name: "Abby Lee", email: "abby@example.edu", notesByCycle: { "0": "Strong anchor", "1": "Needs b-roll" } },
    { id: "otto", name: null, email: "otto@example.edu", notesByCycle: {} }
  ]
};

describe("parseNoteKey", () => {
  it("splits on the last colon", () => {
    expect(parseNoteKey("abby:3")).toEqual({ userId: "abby", cycleNumber: 3 });
    expect(parseNoteKey("a:b:0")).toEqual({ userId: "a:b", cycleNumber: 0 });
  });

  it("rejects keys without a user or a whole cycle number", () => {
    expect(parseNoteKey(":1")).toBeNull();
    expect(parseNoteKey("abby")).toBeNull();
    expect(parseNoteKey("abby:1.5")).toBeNull();
  });
});

describe("notesFromMembers / withSavedNotes", () => {
  it("keys every note by member and cycle", () => {
    expect(notesFromMembers(payload.members)).toEqual({ "abby:0": "Strong anchor", "abby:1": "Needs b-roll" });
  });

  it("writes acknowledged notes back into the payload without touching the original", () => {
    const next = withSavedNotes(payload, { "otto:2": "Late twice", "abby:1": "Has b-roll now" });
    expect(next.members[0].notesByCycle).toEqual({ "0": "Strong anchor", "1": "Has b-roll now" });
    expect(next.members[1].notesByCycle).toEqual({ "2": "Late twice" });
    expect(payload.members[1].notesByCycle).toEqual({});
  });
});

describe("rebaseNotes", () => {
  it("takes the server copy for untouched notes and keeps the viewer's drafts for touched ones", () => {
    const server = { "abby:0": "Server general", "otto:0": "Server otto" };
    const local = {
      drafts: { "abby:0": "Typed before refresh", "otto:0": "Old otto" },
      saved: { "abby:0": "Acknowledged", "otto:0": "Old otto" }
    };
    const result = rebaseNotes(server, local, new Set(["abby:0"]));
    expect(result.drafts).toEqual({ "abby:0": "Typed before refresh", "otto:0": "Server otto" });
    expect(result.saved).toEqual({ "abby:0": "Acknowledged", "otto:0": "Server otto" });
  });

  it("keeps a touched note the server doesn't have yet", () => {
    const result = rebaseNotes({}, { drafts: { "otto:1": "New" }, saved: {} }, new Set(["otto:1"]));
    expect(result.drafts).toEqual({ "otto:1": "New" });
    expect(result.saved).toEqual({});
  });
});

describe("coverage and labels", () => {
  const notes = { "abby:0": "General", "abby:2": "  ", "abby:3": "Cycle three" };

  it("lists the tabs with a non-blank note, in tab order", () => {
    expect(tabsWithNotes(notes, "abby", [0, 1, 2, 3])).toEqual([0, 3]);
    expect(tabsWithNotes(notes, "otto", [0, 1])).toEqual([]);
  });

  it("describes coverage for screen readers", () => {
    expect(coverageLabel([0, 3])).toBe("Notes: General, Cycle 03");
    expect(coverageLabel([])).toBe("No notes yet");
  });

  it("names tabs and missing cycles", () => {
    expect(tabTitle(0)).toBe("General");
    expect(tabTitle(12)).toBe("Cycle 12");
    expect(missingCyclesText([2, 4])).toBe("No notes for Cycle 02, 04.");
  });

  it("keeps the header copy for each tab", () => {
    expect(tabDescription(true, 0, null)).toMatch(/^Standing notes on each reporter/);
    expect(tabDescription(false, 1, payload.cycles[0])).toBe("Cycle 1 · Campus food");
    expect(tabDescription(false, 2, payload.cycles[1])).toBe("Notes for package cycle 2.");
  });

  it("falls back from name to email to a placeholder", () => {
    expect(personLabel({ name: " Abby Lee ", email: null })).toBe("Abby Lee");
    expect(personLabel({ name: "  ", email: "otto@example.edu" })).toBe("otto@example.edu");
    expect(personLabel({ name: null, email: null })).toBe("Unnamed member");
  });
});

describe("remembered-value guards", () => {
  it("accepts only known filters and layouts", () => {
    expect(isNoteFilter("with")).toBe(true);
    expect(isNoteFilter("some")).toBe(false);
    expect(isMembersLayout("class")).toBe(true);
    expect(isMembersLayout("grid")).toBe(false);
  });
});
