import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebugLogLinks } from "@/app/(app)/editing/show-edit-parts";
import { editorLogPath, isEditorLogPath, mergeDebugLog } from "@/src/lib/show-editor-debug-logs";

const SHOW = "2026-10-21";
const path = editorLogPath({ showDate: SHOW, jobId: "job1", version: 3, stamp: "abc" });

describe("debug log paths", () => {
  it("names the bundle for the show, job, version and stamp, and accepts it back", () => {
    expect(path).toBe("Package Storage/Shows/2026-10-21/editor-logs/job1-v3-abc.tar.gz");
    expect(isEditorLogPath(path, SHOW, "job1")).toBe(true);
  });

  it("refuses another show or job, a subfolder, .. and other extensions", () => {
    expect(isEditorLogPath(path, "2026-10-22", "job1")).toBe(false);
    expect(isEditorLogPath(path, SHOW, "job")).toBe(false);
    expect(isEditorLogPath("Package Storage/Shows/2026-10-21/editor-logs/job1-v.tar.gz", SHOW, "job1")).toBe(false);
    expect(isEditorLogPath("Package Storage/Shows/2026-10-21/editor-logs/job1-v3/x.tar.gz", SHOW, "job1")).toBe(false);
    expect(isEditorLogPath("Package Storage/Shows/2026-10-21/editor-logs/job1-v3-..tar.gz", SHOW, "job1")).toBe(false);
    expect(isEditorLogPath("Package Storage/Shows/2026-10-21/editor-logs/job1-v3-abc.tgz", SHOW, "job1")).toBe(false);
  });
});

describe("mergeDebugLog", () => {
  const v1 = { version: 1, path: "a.tar.gz", at: "2026-10-20T20:00:00.000Z" };
  const v2 = { version: 2, path: "b.tar.gz", at: "2026-10-20T21:00:00.000Z" };

  it("leaves checks alone when there are no logs", () => {
    const next = { coversClean: true };
    expect(mergeDebugLog(null, next, null)).toBe(next);
  });

  it("carries earlier logs over, appends the new one and points debugLog at it", () => {
    expect(mergeDebugLog({ debugLogs: [v1], other: 1 }, { coversClean: true }, v2)).toEqual({
      coversClean: true, debugLog: "b.tar.gz", debugLogs: [v1, v2]
    });
  });

  it("keeps the logs across a run that sent none, and doesn't list a retried path twice", () => {
    expect(mergeDebugLog({ debugLogs: [v1, v2] }, {}, null)).toEqual({ debugLog: "b.tar.gz", debugLogs: [v1, v2] });
    expect(mergeDebugLog({ debugLogs: [v1] }, {}, { ...v1, at: v2.at }).debugLogs).toEqual([{ ...v1, at: v2.at }]);
  });

  it("ignores malformed entries", () => {
    expect(mergeDebugLog({ debugLogs: [{ version: "1" }, v1] }, {}, null)).toEqual({ debugLog: "a.tar.gz", debugLogs: [v1] });
  });
});

describe("DebugLogLinks", () => {
  const log = (version: number, url: string | null) => ({ version, url, at: `2026-10-20T2${version}:00:00.000Z` });

  it("renders nothing without a downloadable log", () => {
    expect(renderToStaticMarkup(<DebugLogLinks logs={[]} />)).toBe("");
    expect(renderToStaticMarkup(<DebugLogLinks logs={[log(1, null)]} />)).toBe("");
  });

  it("links the newest version with the hint, and earlier ones behind a disclosure", () => {
    const markup = renderToStaticMarkup(<DebugLogLinks logs={[log(3, "https://drive.example.org/v3"), log(2, "https://drive.example.org/v2"), log(1, null)]} />);
    expect(markup).toContain("Debug log (v3)");
    expect(markup).toContain("Download debug log");
    expect(markup).toContain('href="https://drive.example.org/v3"');
    expect(markup).toContain("Editor log and AI transcript for this run. Share it when reporting a problem.");
    expect(markup).toContain("<details");
    expect(markup).toContain("Earlier versions (1)");
    expect(markup).toContain('href="https://drive.example.org/v2"');
  });

  it("has no disclosure with only one log", () => {
    expect(renderToStaticMarkup(<DebugLogLinks logs={[log(1, "https://drive.example.org/v1")]} />)).not.toContain("<details");
  });
});
