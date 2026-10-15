import { describe, expect, it } from "vitest";
import {
  approvalOptionState,
  approvalTagLabel,
  buildProjectQueryHref,
  commonFolderValue,
  folderStages,
  folderTag,
  formatApprovalLabel,
  formatDuration,
  formatMemberNameSummary,
  formatTileDateLabel,
  getActiveVersion,
  keepExistingSelection,
  pageRange,
  pendingItemCount,
  reconcileVersionOverrides,
  selectAllState,
  SERVER_DATE_ZONE,
  thumbState,
  titleFromFileName,
  toAiredDateInputValue,
  viewCountNoun
} from "@/components/project-assets/format";
import type { MediaTileItem, MediaTileVersion } from "@/components/project-assets/types";

function version(id: string, versionNumber: number, overrides: Partial<MediaTileVersion> = {}): MediaTileVersion {
  return {
    id,
    versionNumber,
    sourceType: "VIDEO",
    status: "READY",
    approvalStatus: "IN_REVIEW",
    airedAt: null,
    thumbnailUrl: null,
    durationSeconds: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    createdByName: "Abby",
    commentCount: 0,
    ...overrides
  };
}

function item(id: string, versions: MediaTileVersion[], folderId: string | null = null): MediaTileItem {
  return {
    id,
    title: `Package ${id}`,
    reviewHref: `/projects/p1/review/${id}`,
    currentVersionId: versions[0]?.id ?? null,
    folderId,
    deletedAt: null,
    deletedByName: null,
    assignedMembers: [],
    versions
  };
}

describe("approvalOptionState", () => {
  it("allows the current status and the server's transitions", () => {
    expect(approvalOptionState("IN_REVIEW", "IN_REVIEW")).toEqual({ disabled: false });
    expect(approvalOptionState("IN_REVIEW", "APPROVED")).toEqual({ disabled: false });
    expect(approvalOptionState("APPROVED", "AIRED")).toEqual({ disabled: false });
    expect(approvalOptionState("AIRED", "AIRED")).toEqual({ disabled: false });
  });

  it("explains blocked transitions", () => {
    expect(approvalOptionState("IN_REVIEW", "AIRED")).toEqual({ disabled: true, hint: "Approve first" });
    expect(approvalOptionState("NEEDS_CHANGES", "AIRED")).toEqual({ disabled: true, hint: "Approve first" });
    expect(approvalOptionState("AIRED", "APPROVED")).toEqual({ disabled: true, hint: "Not from Aired" });
    expect(approvalOptionState("APPROVED", "IN_REVIEW")).toEqual({ disabled: true, hint: "Not from Approved" });
  });
});

describe("approval labels", () => {
  it("uses sentence case", () => {
    expect(formatApprovalLabel("IN_REVIEW")).toBe("In review");
    expect(formatApprovalLabel("NEEDS_CHANGES")).toBe("Needs changes");
  });

  it("adds the air date to Aired", () => {
    const label = approvalTagLabel({ approvalStatus: "AIRED", airedAt: "2026-10-03T00:00:00.000Z" });
    expect(label.startsWith("Aired · ")).toBe(true);
    expect(label).toContain("2026");
    expect(approvalTagLabel({ approvalStatus: "AIRED", airedAt: null })).toBe("Aired");
  });

  it("formats the air date in the zone's locale, always on the UTC day", () => {
    const aired = { approvalStatus: "AIRED" as const, airedAt: "2026-10-03T00:00:00.000Z" };
    expect(approvalTagLabel(aired, SERVER_DATE_ZONE)).toBe("Aired · Oct 3, 2026");
    expect(approvalTagLabel(aired, { locale: "en-GB" })).toBe("Aired · 3 Oct 2026");
    expect(approvalTagLabel(aired, { locale: "en-US", timeZone: "America/Los_Angeles" })).toBe("Aired · Oct 3, 2026");
  });
});

describe("folderStages", () => {
  const folders = [
    { id: "g", name: "Group A", itemCount: 8 },
    { id: "ab", name: "Group A/A-roll B-roll", itemCount: 6 },
    { id: "a", name: "Group A/A-roll B-roll/A-roll", itemCount: 4 },
    { id: "ic", name: "Group A/Initial Cut", itemCount: 2 },
    { id: "fc", name: "Group A/Final Cut", itemCount: 0 },
    { id: "misc", name: "Misc", itemCount: 3 }
  ];

  it("reads a Cycle group's stage folder counts in stage order", () => {
    expect(folderStages(folders[0], folders)?.map((stage) => [stage.key, stage.count])).toEqual([
      ["ab", 6],
      ["initial", 2],
      ["final", 0]
    ]);
  });

  it("is null for stage folders and plain folders", () => {
    expect(folderStages(folders[4], folders)).toBeNull();
    expect(folderStages(folders[5], folders)).toBeNull();
  });
});

describe("selection helpers", () => {
  const items = [item("m1", [version("v1", 1)], "f1"), item("m2", [version("v2", 1)], "f1"), item("m3", [version("v3", 1)])];

  it("keeps selected ids that still exist, same array when nothing changed", () => {
    const selected = ["m1", "m2"];
    expect(keepExistingSelection(selected, items)).toBe(selected);
    expect(keepExistingSelection(["m1", "gone"], items)).toEqual(["m1"]);
  });

  it("reports none / some / all for the page", () => {
    expect(selectAllState(["m1", "m2"], [])).toBe("none");
    expect(selectAllState(["m1", "m2"], ["m1"])).toBe("some");
    expect(selectAllState(["m1", "m2"], ["m2", "m1"])).toBe("all");
    expect(selectAllState([], ["m1"])).toBe("none");
  });

  it("finds the shared folder, or null when the selection is mixed", () => {
    expect(commonFolderValue(items, ["m1", "m2"])).toBe("f1");
    expect(commonFolderValue(items, ["m3"])).toBe("root");
    expect(commonFolderValue(items, ["m1", "m3"])).toBeNull();
    expect(commonFolderValue(items, [])).toBeNull();
  });
});

describe("version picks", () => {
  const media = item("m1", [version("v2", 2), version("v1", 1)]);

  it("shows the current version unless one was picked", () => {
    expect(getActiveVersion(media, {})?.id).toBe("v2");
    expect(getActiveVersion(media, { m1: "v1" })?.id).toBe("v1");
    expect(getActiveVersion(media, { m1: "missing" })?.id).toBe("v2");
    expect(getActiveVersion({ ...media, currentVersionId: "v1" }, {})?.id).toBe("v1");
    expect(getActiveVersion({ ...media, currentVersionId: null }, {})?.id).toBe("v2");
  });

  it("drops picks whose version is gone, same object otherwise", () => {
    const picks = { m1: "v1" };
    expect(reconcileVersionOverrides(picks, [media])).toBe(picks);
    expect(reconcileVersionOverrides({ m1: "v9", m2: "v1" }, [media])).toEqual({});
  });
});

describe("thumbState", () => {
  it("prefers a local upload", () => {
    expect(thumbState({ status: "UPLOADING" }, { status: "UPLOADING", progress: 42 })).toEqual({ status: "UPLOADING", progress: 42 });
  });

  it("reads a server upload without a local one as processing", () => {
    expect(thumbState({ status: "UPLOADING" }, null)).toEqual({ status: "PROCESSING", progress: 100 });
    expect(thumbState({ status: "FAILED" }, null)).toEqual({ status: "FAILED", progress: 0 });
    expect(thumbState({ status: "READY" }, null)).toEqual({ status: null, progress: 0 });
  });
});

describe("formatting", () => {
  it("formats durations and page ranges", () => {
    expect(formatDuration(125)).toBe("02:05");
    expect(formatDuration(null)).toBe("--:--");
    expect(pageRange(2, 40, 40)).toEqual({ start: 41, end: 80 });
    expect(pageRange(1, 40, 0)).toEqual({ start: 0, end: 0 });
  });

  it("names the toolbar count after the status filter in the active scope only", () => {
    expect(viewCountNoun(1, "all", "active")).toBe("asset");
    expect(viewCountNoun(12, "all", "active")).toBe("assets");
    expect(viewCountNoun(2, "failed", "active")).toBe("failed");
    expect(viewCountNoun(1, "in-progress", "active")).toBe("in progress");
    expect(viewCountNoun(3, "ready", "active")).toBe("ready");
    expect(viewCountNoun(3, "failed", "deleted")).toBe("assets");
  });

  it("builds air-date input values in UTC", () => {
    expect(toAiredDateInputValue("2026-10-03T00:00:00.000Z")).toBe("2026-10-03");
    expect(toAiredDateInputValue(null, new Date("2026-10-15T23:30:00.000Z"))).toBe("2026-10-15");
  });

  it("titles uploads from the file name", () => {
    expect(titleFromFileName("Robotics team final.mp4")).toBe("Robotics team final");
    expect(titleFromFileName(".mp4")).toBe("Untitled upload");
  });
});

describe("buildProjectQueryHref", () => {
  const path = "/projects/p1";

  it("opens a folder, keeping view and collection but going back to page 1", () => {
    expect(buildProjectQueryHref(path, "view=list&page=3&collection=videos", { scope: "active", folderId: "f1" })).toBe(
      "/projects/p1?view=list&collection=videos&scope=active&folderId=f1"
    );
  });

  it("changes filter and sort on page 1, and pages keep the rest", () => {
    expect(buildProjectQueryHref(path, "sort=name&page=2", { filter: "failed" })).toBe("/projects/p1?sort=name&filter=failed");
    expect(buildProjectQueryHref(path, "filter=ready", { page: 2, preservePage: true })).toBe("/projects/p1?filter=ready&page=2");
    expect(buildProjectQueryHref(path, "page=2", { page: 1, preservePage: true })).toBe("/projects/p1?");
  });

  it("removes the one-shot new= param", () => {
    expect(buildProjectQueryHref(path, "new=upload&view=grid", { new: null, preservePage: true })).toBe("/projects/p1?view=grid");
  });
});

describe("pendingItemCount", () => {
  it("counts assets uploading here or still processing", () => {
    const items = [
      item("m1", [version("v1", 1, { status: "PROCESSING" })], "f2"),
      item("m2", [version("v2", 1)], "f1"),
      item("m3", [version("v3", 1)], "f3"),
      item("m4", [version("v4", 1, { status: "UPLOADING" })], null)
    ];
    expect(pendingItemCount(items, ["m2", null])).toBe(3);
    expect(pendingItemCount(items.slice(2, 3), [])).toBe(0);
  });
});

describe("folderTag", () => {
  it("tags only empty folders, whatever their stage", () => {
    expect(folderTag({ itemCount: 0 })).toEqual({ tone: "neutral", label: "Empty" });
    expect(folderTag({ itemCount: 2 })).toBeNull();
  });
});

describe("people and dates", () => {
  it("summarizes assignees", () => {
    expect(formatMemberNameSummary([])).toBe("No assignees");
    expect(formatMemberNameSummary([{ name: "Abby Lee", email: null }])).toBe("Abby Lee");
    expect(
      formatMemberNameSummary([
        { name: "Abby Lee", email: null },
        { name: null, email: "otto@example.edu" },
        { name: "Sage", email: null }
      ], SERVER_DATE_ZONE)
    ).toBe("Abby, otto, and Sage");
  });

  it("formats dates in a fixed time zone when asked", () => {
    expect(formatTileDateLabel("2026-10-03T23:30:00.000Z", SERVER_DATE_ZONE)).toBe("Oct 03, 2026");
    expect(formatTileDateLabel("not a date", SERVER_DATE_ZONE)).toBe("Unknown date");
  });
});
