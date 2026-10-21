import { describe, expect, it } from "vitest";
import {
  autoPublishReady, defaultRecordingSelection, editorStatus, lastSeenLabel, recordingsFromListing, toggleRecording,
  type ShowRecording
} from "@/src/lib/show-editor";

const NOW = new Date("2026-10-20T22:00:00Z");

describe("show editor helpers", () => {
  it("lists only finished video files, newest first", () => {
    const recordings = recordingsFromListing([
      { name: "old.mov", path: "Shows/old.mov", isDir: false, size: 10, mtime: "2026-10-13T18:00:00Z" },
      { name: "notes.txt", path: "Shows/notes.txt", isDir: false, size: 1, mtime: "2026-10-20T18:00:00Z" },
      { name: "Archive", path: "Shows/Archive", isDir: true, size: 0, mtime: "2026-10-20T18:00:00Z" },
      { name: "._new.mov", path: "Shows/._new.mov", isDir: false, size: 1, mtime: "2026-10-20T18:00:00Z" },
      { name: "new.MP4", path: "Shows/new.MP4", isDir: false, size: 20, mtime: "2026-10-20T18:00:00Z" },
      { name: "copying.mov", path: "Shows/copying.mov", isDir: false, size: 5, mtime: "2026-10-20T21:59:00Z" }
    ], NOW);
    expect(recordings.map((recording) => [recording.name, recording.stable])).toEqual([
      ["copying.mov", false], ["new.MP4", true], ["old.mov", true]
    ]);
  });

  it("keeps at most 30 recordings", () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      name: `${index}.mov`, path: `Shows/${index}.mov`, isDir: false, size: 1, mtime: new Date(NOW.getTime() - index * 3600_000).toISOString()
    }));
    expect(recordingsFromListing(items, NOW)).toHaveLength(30);
  });

  it("describes the editor's status", () => {
    const base = { busy: false, version: "v0.3.1", health: { ok: true, problems: [] } };
    expect(editorStatus({ ...base, online: true, lastSeenAt: NOW.toISOString() }, NOW)).toEqual({ tone: "success", label: "Editor online · v0.3.1" });
    expect(editorStatus({ ...base, version: null, online: true, busy: true, lastSeenAt: NOW.toISOString() }, NOW).label).toBe("Editor online · busy");
    expect(editorStatus({ ...base, online: false, lastSeenAt: "2026-10-20T21:48:00Z" }, NOW).label).toBe("Editor offline · last seen 12 min ago");
    expect(editorStatus({ ...base, online: true, lastSeenAt: NOW.toISOString(), health: { ok: false, problems: ["On battery"] } }, NOW).tone).toBe("warning");
    expect(lastSeenLabel(null, NOW)).toBe("never");
  });

  it("preselects the newest finished recording from the filming day", () => {
    const recordings: ShowRecording[] = [
      { path: "Shows/show-day.mov", name: "show-day.mov", size: 1, modifiedAt: "2026-10-21T16:00:00Z", stable: true },
      { path: "Shows/copying.mov", name: "copying.mov", size: 1, modifiedAt: "2026-10-20T21:59:00Z", stable: false },
      { path: "Shows/filmed.mov", name: "filmed.mov", size: 1, modifiedAt: "2026-10-20T17:00:00Z", stable: true },
      { path: "Shows/last-week.mov", name: "last-week.mov", size: 1, modifiedAt: "2026-10-13T17:00:00Z", stable: true }
    ];
    expect(defaultRecordingSelection(recordings, "2026-10-21")).toEqual(["Shows/filmed.mov"]);
    expect(defaultRecordingSelection(recordings.slice(3), "2026-10-21")).toEqual([]);
  });

  it("orders picked recordings and caps them at four", () => {
    expect(toggleRecording(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleRecording(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleRecording(["a", "b", "c", "d"], "e")).toEqual(["a", "b", "c", "d"]);
  });

  it("auto-publish needs clean covers and every loudness row ok", () => {
    expect(autoPublishReady({ needsReview: false, checks: { coversClean: true, loudness: [{ ok: true }] } })).toBe(true);
    expect(autoPublishReady({ needsReview: false, checks: { coversClean: true, loudness: [] } })).toBe(false);
    expect(autoPublishReady({ needsReview: false, checks: { coversClean: false, loudness: [{ ok: true }] } })).toBe(false);
    expect(autoPublishReady({ needsReview: true, checks: { coversClean: true, loudness: [{ ok: true }] } })).toBe(false);
    expect(autoPublishReady({ needsReview: false, checks: null })).toBe(false);
  });
});
