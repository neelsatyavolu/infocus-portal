import { describe, expect, it } from "vitest";

import {
  buildUserNameCandidates,
  groupMembersIncludeUserName
} from "@/src/lib/group-members";
import {
  getCutKindFromFolderName,
  parseCycleNumberFromProjectName,
  resolveManualCutFlags
} from "@/src/server/cycle-cut-status";

describe("parseCycleNumberFromProjectName", () => {
  it("extracts cycle 1-4 from canonical project names", () => {
    expect(parseCycleNumberFromProjectName("Package Cycle 1")).toBe(1);
    expect(parseCycleNumberFromProjectName("Package Cycle 4")).toBe(4);
  });

  it("is case-insensitive and tolerates surrounding text", () => {
    expect(parseCycleNumberFromProjectName("package cycle 2")).toBe(2);
    expect(parseCycleNumberFromProjectName("Spring 2026 - Package Cycle 3 - Hard News")).toBe(3);
  });

  it("rejects out-of-range or non-matching names", () => {
    expect(parseCycleNumberFromProjectName("Package Cycle 5")).toBeNull();
    expect(parseCycleNumberFromProjectName("PackageCycle 1")).toBeNull();
    expect(parseCycleNumberFromProjectName("Cycle 1")).toBeNull();
    expect(parseCycleNumberFromProjectName("")).toBeNull();
    expect(parseCycleNumberFromProjectName(null)).toBeNull();
    expect(parseCycleNumberFromProjectName(undefined)).toBeNull();
  });
});

describe("getCutKindFromFolderName", () => {
  it("identifies Initial Cut and Final Cut folders", () => {
    expect(getCutKindFromFolderName("Initial Cut")).toBe("INITIAL");
    expect(getCutKindFromFolderName("Final Cut")).toBe("FINAL");
  });

  it("normalizes whitespace and case", () => {
    expect(getCutKindFromFolderName("  initial cut ")).toBe("INITIAL");
    expect(getCutKindFromFolderName("FINAL CUT")).toBe("FINAL");
  });

  it("returns null for unrelated or empty folder names", () => {
    expect(getCutKindFromFolderName("Drafts")).toBeNull();
    expect(getCutKindFromFolderName("")).toBeNull();
    expect(getCutKindFromFolderName(null)).toBeNull();
    expect(getCutKindFromFolderName(undefined)).toBeNull();
  });
});

describe("groupMembersIncludeUserName", () => {
  it("matches a single first-name token against a multi-word display name", () => {
    const candidates = buildUserNameCandidates("Neel Satyavolu", "neel@example.com");
    expect(groupMembersIncludeUserName("Neel, Priya", candidates)).toBe(true);
  });

  it("requires both first and last token to match when both sides have full names", () => {
    const candidates = buildUserNameCandidates("Priya Tamura", "ptamura@example.com");
    expect(groupMembersIncludeUserName("Priya T", candidates)).toBe(true);
    expect(groupMembersIncludeUserName("Priya Singh", candidates)).toBe(false);
  });

  it("falls back to email local-part when display name is unavailable", () => {
    const candidates = buildUserNameCandidates(null, "neel@example.com");
    expect(groupMembersIncludeUserName("neel", candidates)).toBe(true);
  });

  it("returns false on empty inputs", () => {
    const candidates = buildUserNameCandidates("Neel Satyavolu", "neel@example.com");
    expect(groupMembersIncludeUserName("", candidates)).toBe(false);
    expect(groupMembersIncludeUserName("Neel", new Set())).toBe(false);
  });
});

describe("resolveManualCutFlags", () => {
  it("treats an explicit client manual flag as authoritative even without a prior row", () => {
    // Reproduces the revert bug: after a save the row id changes, so the
    // prior row can no longer be matched. The client-sent flag must still win.
    expect(
      resolveManualCutFlags(
        { initialCut: true, finalCut: false, initialCutManual: true },
        null
      )
    ).toEqual({ initialCutManual: true, finalCutManual: false });
  });

  it("keeps a prior manual flag sticky once it has been set", () => {
    expect(
      resolveManualCutFlags(
        { initialCut: false, finalCut: false },
        { initialCut: true, finalCut: false, initialCutManual: true, finalCutManual: false }
      )
    ).toEqual({ initialCutManual: true, finalCutManual: false });
  });

  it("marks a flag manual when the submitted value differs from the prior value", () => {
    expect(
      resolveManualCutFlags(
        { initialCut: true, finalCut: true },
        { initialCut: false, finalCut: true, initialCutManual: false, finalCutManual: false }
      )
    ).toEqual({ initialCutManual: true, finalCutManual: false });
  });

  it("leaves untouched, never-overridden flags free for automatic updates", () => {
    expect(
      resolveManualCutFlags(
        { initialCut: false, finalCut: false, initialCutManual: false, finalCutManual: false },
        { initialCut: false, finalCut: false, initialCutManual: false, finalCutManual: false }
      )
    ).toEqual({ initialCutManual: false, finalCutManual: false });
  });

  it("respects the client flag even when the value matches the prior row", () => {
    expect(
      resolveManualCutFlags(
        { initialCut: true, finalCut: false, finalCutManual: true },
        { initialCut: true, finalCut: false, initialCutManual: false, finalCutManual: false }
      )
    ).toEqual({ initialCutManual: false, finalCutManual: true });
  });
});
