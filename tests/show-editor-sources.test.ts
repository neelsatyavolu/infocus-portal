import { describe, expect, it } from "vitest";
import type { ShowRecording } from "@/src/lib/show-editor";
import {
  autoStartGroups, briefSources, defaultSourceSelection, normalizeSources, preselectionExclusion, recordingNotes,
  setSourceRole, showDateFromName, showRecordingBaseName, sourceSelectionError, toggleFolder, toggleSource, visibleRecordings
} from "@/src/lib/show-editor-sources";
import { isShowRecordingPath } from "@/src/lib/show-editor";

const NOW = new Date("2026-10-21T22:00:00Z");

let nextSize = 1_000_000;

/** Every file gets its own size unless a test sets one (equal sizes mean "a copy" to the preselection). */
function file(name: string, overrides: Partial<ShowRecording> = {}): ShowRecording {
  nextSize += 1;
  return {
    path: overrides.folder ? `${overrides.folder}/${name}` : `Shows/${name}`, name, size: nextSize,
    modifiedAt: "2026-10-21T18:00:00.000Z", stable: true, folder: null, ...overrides
  };
}

describe("source roles and storage", () => {
  it("reads an old plain path list as files on Auto", () => {
    expect(normalizeSources(["Shows/a.mov", "Shows/b.mov"])).toEqual([
      { path: "Shows/a.mov", role: "auto" }, { path: "Shows/b.mov", role: "auto" }
    ]);
  });

  it("keeps known roles, turns unknown ones into Auto and drops junk", () => {
    expect(normalizeSources([
      { path: "Shows/a.mov", role: "M" }, { path: "Shows/b.mov", role: "camera-9" }, { path: "Shows/c.mov", role: "ignore" },
      { role: "L" }, "", 7, null
    ])).toEqual([
      { path: "Shows/a.mov", role: "M" }, { path: "Shows/b.mov", role: "auto" }, { path: "Shows/c.mov", role: "ignore" }
    ]);
    expect(normalizeSources(null)).toEqual([]);
  });

  it("numbers sources in the brief from 1, in the producer's order", () => {
    expect(briefSources([{ path: "Shows/b.mov", role: "R" }, { path: "Shows/a.mov", role: "auto" }])).toEqual([
      { path: "Shows/b.mov", role: "R", order: 1 }, { path: "Shows/a.mov", role: "auto", order: 2 }
    ]);
  });
});

describe("selection rules", () => {
  it("explains what's wrong in a plain sentence", () => {
    expect(sourceSelectionError([])).toBe("Pick at least one recording.");
    expect(sourceSelectionError(Array.from({ length: 13 }, (_, index) => ({ path: `Shows/${index}.mov`, role: "auto" as const }))))
      .toBe("Pick at most 12 files.");
    expect(sourceSelectionError([{ path: "Shows/a.mov", role: "auto" }, { path: "Shows/a.mov", role: "M" }])).toBe("Pick each recording once.");
    expect(sourceSelectionError([{ path: "Shows/a.mov", role: "ignore" }])).toBe("Every file is set to Ignore. Use at least one.");
  });

  it("allows program and camera files together (the editor sorts them out)", () => {
    expect(sourceSelectionError([
      { path: "Shows/a.mov", role: "program" }, { path: "Shows/b.mov", role: "M" }, { path: "Shows/c.mov", role: "auto" },
      { path: "Shows/d.mov", role: "ignore" }
    ])).toBeNull();
  });

  it("adds files on Auto, removes them on a second click, and stops at 12", () => {
    const one = toggleSource([], "Shows/a.mov");
    expect(one).toEqual([{ path: "Shows/a.mov", role: "auto" }]);
    expect(toggleSource(one, "Shows/a.mov")).toEqual([]);
    const full = Array.from({ length: 12 }, (_, index) => ({ path: `Shows/${index}.mov`, role: "auto" as const }));
    expect(toggleSource(full, "Shows/13.mov")).toHaveLength(12);
    expect(setSourceRole(one, "Shows/a.mov", "L")).toEqual([{ path: "Shows/a.mov", role: "L" }]);
  });

  it("selecting a folder adds its finished files oldest first, and selecting it again removes them", () => {
    const folder = "Shows/10-22 ISO";
    const files = [
      file("cam b.mov", { folder, modifiedAt: "2026-10-21T18:05:00.000Z" }),
      file("cam a.mov", { folder, modifiedAt: "2026-10-21T18:00:00.000Z" }),
      file("cam c.mov", { folder, stable: false })
    ];
    const added = toggleFolder([{ path: "Shows/other.mov", role: "program" }], files);
    expect(added).toEqual([
      { path: "Shows/other.mov", role: "program" }, { path: `${folder}/cam a.mov`, role: "auto" }, { path: `${folder}/cam b.mov`, role: "auto" }
    ]);
    expect(toggleFolder(added, files)).toEqual([{ path: "Shows/other.mov", role: "program" }]);
  });
});

describe("names and preselection", () => {
  it("reads the airing date from TriCaster names, repeats included", () => {
    expect(showRecordingBaseName("2026-10-22")).toBe("InFocus Show 10-22-2026");
    expect(showDateFromName("InFocus Show 10-22-2026.mov")).toBe("2026-10-22");
    expect(showDateFromName("InFocus Show 10-22-2026 (1).mov")).toBe("2026-10-22");
    expect(showDateFromName("infocus show 10-22-2026 (2).MP4")).toBe("2026-10-22");
    expect(showDateFromName("InFocus Show.mov")).toBeNull();
    expect(showDateFromName("InFocus Show 10-22-2026 EDITED.mov")).toBeNull();
    expect(showDateFromName("InFocus Show 10-22-2026.prproj")).toBeNull();
  });

  it("preselects the show's clips by airing-date name, oldest first, on Auto", () => {
    const recordings = [
      file("InFocus Show 10-22-2026 (2).mov", { modifiedAt: "2026-10-21T19:10:00.000Z" }),
      file("InFocus Show 10-22-2026.mov", { modifiedAt: "2026-10-21T18:00:00.000Z" }),
      file("InFocus Show 10-22-2026 (1).mov", { modifiedAt: "2026-10-21T18:40:00.000Z" }),
      file("InFocus Show 10-21-2026.mov", { modifiedAt: "2026-10-20T18:00:00.000Z" })
    ];
    expect(defaultSourceSelection(recordings, "2026-10-22")).toEqual([
      { path: "Shows/InFocus Show 10-22-2026.mov", role: "auto" },
      { path: "Shows/InFocus Show 10-22-2026 (1).mov", role: "auto" },
      { path: "Shows/InFocus Show 10-22-2026 (2).mov", role: "auto" }
    ]);
  });

  it("also finds the show's clips inside a subfolder", () => {
    const folder = "Shows/ISO 10-22";
    expect(defaultSourceSelection([file("InFocus Show 10-22-2026.mov", { folder })], "2026-10-22"))
      .toEqual([{ path: `${folder}/InFocus Show 10-22-2026.mov`, role: "auto" }]);
  });

  it("never preselects EDITED exports, the untitled file, still-copying files or a copy of another show", () => {
    const copy = file("InFocus Show 10-22-2026 (1).mov", { size: 777 });
    const recordings = [
      file("InFocus Show 10-22-2026 EDITED.mov"),
      file("InFocus Show.mov"),
      file("InFocus Show 10-22-2026 (2).mov", { stable: false }),
      copy,
      file("InFocus Show 10-21-2026.mov", { size: 777 }),
      file("InFocus Show 10-22-2026.mov", { size: 555 })
    ];
    expect(defaultSourceSelection(recordings, "2026-10-22")).toEqual([{ path: "Shows/InFocus Show 10-22-2026.mov", role: "auto" }]);
    expect(preselectionExclusion(copy, recordings)).toBe("Same size as InFocus Show 10-21-2026.mov: probably a copy of another show");
    const notes = recordingNotes(recordings);
    expect(notes["Shows/InFocus Show 10-22-2026 (1).mov"]).toMatch(/^Same size as InFocus Show 10-21-2026\.mov/);
    expect(notes["Shows/InFocus Show 10-22-2026 EDITED.mov"]).toBe("An edited export, not a recording");
  });

  it("two takes of the same show with the same size aren't copies of another show", () => {
    const recordings = [file("InFocus Show 10-22-2026.mov", { size: 9 }), file("InFocus Show 10-22-2026 (1).mov", { size: 9 })];
    expect(defaultSourceSelection(recordings, "2026-10-22")).toHaveLength(2);
  });
});

describe("auto-start grouping", () => {
  const window = { firstDate: "2026-10-21", lastDate: "2026-10-28" };
  const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

  it("groups every candidate file for the show and waits 10 minutes after a single file", () => {
    const recordings = [file("InFocus Show 10-22-2026.mov", { modifiedAt: minutesAgo(9) }), file("InFocus Show 10-20-2026.mov")];
    const [group] = autoStartGroups(recordings, { now: NOW, ...window });
    expect(group).toMatchObject({ showDate: "2026-10-22", ready: false, readyAt: new Date(NOW.getTime() + 60_000).toISOString() });
    expect(autoStartGroups(recordings, { now: new Date(NOW.getTime() + 60_000), ...window })[0].ready).toBe(true);
  });

  it("with several files it waits 10 more minutes after the newest one", () => {
    const recordings = [
      file("InFocus Show 10-22-2026.mov", { modifiedAt: minutesAgo(40), size: 1 }),
      file("InFocus Show 10-22-2026 (1).mov", { modifiedAt: minutesAgo(15), size: 2 })
    ];
    const [group] = autoStartGroups(recordings, { now: NOW, ...window });
    expect(group.files.map((entry) => entry.name)).toEqual(["InFocus Show 10-22-2026.mov", "InFocus Show 10-22-2026 (1).mov"]);
    expect(group.ready).toBe(false);
    expect(group.readyAt).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
  });

  it("leaves out excluded files, aired shows and shows more than a week out", () => {
    const recordings = [
      file("InFocus Show 10-22-2026 EDITED.mov", { modifiedAt: minutesAgo(60) }),
      file("InFocus Show 10-20-2026.mov", { modifiedAt: minutesAgo(60) }),
      file("InFocus Show 11-30-2026.mov", { modifiedAt: minutesAgo(60) })
    ];
    expect(autoStartGroups(recordings, { now: NOW, ...window })).toEqual([]);
  });
});

describe("picker visibility", () => {
  const files = Array.from({ length: 9 }, (_, index) => file(`InFocus Show ${index}.mov`));

  it("shows the newest 6 and counts the rest", () => {
    const { shown, hidden } = visibleRecordings(files, new Set(), false);
    expect(shown.map((entry) => entry.name)).toEqual(files.slice(0, 6).map((entry) => entry.name));
    expect(hidden).toBe(3);
  });

  it("keeps an older ticked file in view, in order", () => {
    const { shown, hidden } = visibleRecordings(files, new Set([files[8].path]), false);
    expect(shown.map((entry) => entry.name)).toEqual([...files.slice(0, 6), files[8]].map((entry) => entry.name));
    expect(hidden).toBe(2);
  });

  it("shows everything once opened, and nothing is hidden with 6 or fewer", () => {
    expect(visibleRecordings(files, new Set(), true)).toEqual({ shown: files, hidden: 0 });
    expect(visibleRecordings(files.slice(0, 6), new Set(), false).hidden).toBe(0);
  });
});

describe("isShowRecordingPath", () => {
  it("takes a file in Shows/ or one folder down", () => {
    expect(isShowRecordingPath("Shows/InFocus Show 10-23-2026.mov")).toBe(true);
    expect(isShowRecordingPath("Shows/ISO 10-23/cam L.mov")).toBe(true);
  });

  it("refuses other roots, traversal, deeper paths, empty parts and backslashes", () => {
    for (const path of [
      "Package Storage/a.mov", "Shows", "Shows/", "/Shows/a.mov", "Shows/../secret.mov", "Shows/ISO/../../x.mov",
      "Shows/./a.mov", "Shows/a/b/c.mov", "Shows//a.mov", "Shows/a\\..\\b.mov", `Shows/${"x".repeat(520)}`
    ]) {
      expect(isShowRecordingPath(path), path).toBe(false);
    }
  });
});
