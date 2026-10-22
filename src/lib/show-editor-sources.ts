/**
 * Which recordings an automatic edit uses (client-safe). The TriCaster names every export
 * `InFocus Show <airing date>.mov`, with ` (1)`/` (2)` for repeats, and records no timecode, so the
 * editor works out from the content which files are program feeds, which are cameras and which belong
 * together. Producers can still pin a file's role, or tell the editor to ignore it.
 * ShowEditJob.sourcePaths stores `[{ path, role }]`; rows from before this hold plain paths (role auto).
 */
import type { ShowRecording } from "@/src/lib/show-editor";

export const SHOW_EDIT_SOURCE_ROLES = ["auto", "program", "M", "L", "R", "ignore"] as const;
export type ShowEditSourceRole = (typeof SHOW_EDIT_SOURCE_ROLES)[number];
export const SHOW_EDIT_SOURCE_ROLE_LABELS: Record<ShowEditSourceRole, string> = {
  auto: "Auto (the editor works it out)",
  program: "Program",
  M: "Camera M (two-shot)",
  L: "Camera L",
  R: "Camera R",
  ignore: "Ignore"
};

export type ShowEditSource = { path: string; role: ShowEditSourceRole };
/**
 * In the brief: `order` is the 1-based position the producer gave it; `modifiedAt` is when the file
 * finished landing on Drive (the TriCaster's export time), which the editor uses to order takes.
 */
export type ShowEditBriefSource = ShowEditSource & { order: number; modifiedAt?: string | null };

export const MAX_SHOW_EDIT_SOURCES = 12;

function isRole(value: unknown): value is ShowEditSourceRole {
  return typeof value === "string" && (SHOW_EDIT_SOURCE_ROLES as readonly string[]).includes(value);
}

/** Stored `sourcePaths` → sources. A plain string (rows from before roles) or an unknown role means auto. */
export function normalizeSources(value: unknown): ShowEditSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ShowEditSource[] => {
    if (typeof entry === "string") return entry ? [{ path: entry, role: "auto" }] : [];
    if (entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string") {
      const { path, role } = entry as { path: string; role?: unknown };
      return path ? [{ path, role: isRole(role) ? role : "auto" }] : [];
    }
    return [];
  });
}

export function briefSources(sources: ShowEditSource[]): ShowEditBriefSource[] {
  return sources.map((source, index) => ({ path: source.path, role: source.role, order: index + 1 }));
}

/** A plain sentence saying what's wrong with this choice of recordings, or null when it can be edited. */
export function sourceSelectionError(sources: ShowEditSource[]): string | null {
  if (sources.length === 0) return "Pick at least one recording.";
  if (sources.length > MAX_SHOW_EDIT_SOURCES) return `Pick at most ${MAX_SHOW_EDIT_SOURCES} files.`;
  if (new Set(sources.map((source) => source.path)).size !== sources.length) return "Pick each recording once.";
  if (sources.every((source) => source.role === "ignore")) return "Every file is set to Ignore. Use at least one.";
  return null;
}

// ── Names and preselection ─────────────────────────────────────────────────────

/** The TriCaster names a show after its AIRING date: `InFocus Show MM-DD-YYYY`. */
export function showRecordingBaseName(showDate: string) {
  const [year, month, day] = showDate.split("-");
  return `InFocus Show ${month}-${day}-${year}`;
}

/** `InFocus Show 10-22-2026 (2).mov` → "2026-10-22", the airing date; null for any other name. */
export function showDateFromName(name: string): string | null {
  const match = /^InFocus Show (\d{2})-(\d{2})-(\d{4})(?: \(\d+\))?\.(?:mov|mp4)$/i.exec(name.trim());
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

/**
 * Why a file is never preselected (or auto-started), or null when it's a candidate for its date. Names with
 * EDITED, the untitled `InFocus Show.mov` and anything not named after an airing date are left out, and so is
 * a file exactly the size of a file for a different date (a copy of another show).
 */
export function preselectionExclusion(recording: ShowRecording, all: ShowRecording[]): string | null {
  if (/edited/i.test(recording.name)) return "An edited export, not a recording";
  const date = showDateFromName(recording.name);
  if (!date) return null;
  const twin = all.find((other) => other.path !== recording.path && other.size === recording.size && (() => {
    const otherDate = showDateFromName(other.name);
    return otherDate !== null && otherDate !== date;
  })());
  return twin ? `Same size as ${twin.name}: probably a copy of another show` : null;
}

/** The files that count for a show: named after its airing date and not excluded, oldest first. */
export function showDateCandidates(recordings: ShowRecording[], showDate: string): ShowRecording[] {
  return recordings
    .filter((recording) => showDateFromName(recording.name) === showDate && !preselectionExclusion(recording, recordings))
    .sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
}

/** Preselect the show's finished clips by name, oldest first (so parts stay in order), each on Auto. */
export function defaultSourceSelection(recordings: ShowRecording[], showDate: string): ShowEditSource[] {
  return showDateCandidates(recordings, showDate)
    .filter((recording) => recording.stable)
    .slice(0, MAX_SHOW_EDIT_SOURCES)
    .map((recording) => ({ path: recording.path, role: "auto" }));
}

/** Notes shown beside listed files (e.g. the copy-of-another-show warning). */
export function recordingNotes(recordings: ShowRecording[]): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const recording of recordings) {
    const note = preselectionExclusion(recording, recordings);
    if (note) notes[recording.path] = note;
  }
  return notes;
}

/** Clicking a file adds it at the end on Auto; clicking again removes it. */
export function toggleSource(selected: ShowEditSource[], path: string): ShowEditSource[] {
  if (selected.some((source) => source.path === path)) return selected.filter((source) => source.path !== path);
  return selected.length >= MAX_SHOW_EDIT_SOURCES ? selected : [...selected, { path, role: "auto" }];
}

/** Selecting a folder adds every finished video in it (or removes them all when they're all chosen). */
export function toggleFolder(selected: ShowEditSource[], files: ShowRecording[]): ShowEditSource[] {
  const usable = files.filter((file) => file.stable).sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
  const chosen = new Set(selected.map((source) => source.path));
  if (usable.length > 0 && usable.every((file) => chosen.has(file.path))) {
    const paths = new Set(usable.map((file) => file.path));
    return selected.filter((source) => !paths.has(source.path));
  }
  const added = usable.filter((file) => !chosen.has(file.path)).map((file): ShowEditSource => ({ path: file.path, role: "auto" }));
  return [...selected, ...added].slice(0, MAX_SHOW_EDIT_SOURCES);
}

export function setSourceRole(selected: ShowEditSource[], path: string, role: ShowEditSourceRole): ShowEditSource[] {
  return selected.map((source) => (source.path === path ? { ...source, role } : source));
}

// ── Auto-start ─────────────────────────────────────────────────────────────────

export const AUTO_START_SETTLE_MS = 10 * 60_000;
/** TriCaster exports arrive one after another: with several files, wait this much longer after the newest. */
export const AUTO_START_EXTRA_MS = 10 * 60_000;

export type AutoStartGroup = {
  showDate: string;
  /** Oldest first, at most 12. */
  files: ShowRecording[];
  ready: boolean;
  readyAt: string;
};

/**
 * Per upcoming show (airing today through `lastDate`): every candidate file named after it. A group is ready
 * once every file has been unchanged for 10 minutes, plus 10 more after the newest one when there are several.
 */
export function autoStartGroups(recordings: ShowRecording[], options: { now: Date; firstDate: string; lastDate: string }): AutoStartGroup[] {
  const dates = new Set(recordings.map((recording) => showDateFromName(recording.name)).filter((date): date is string => date !== null));
  return [...dates]
    .filter((date) => date >= options.firstDate && date <= options.lastDate)
    .sort()
    .flatMap((showDate) => {
      const files = showDateCandidates(recordings, showDate).slice(0, MAX_SHOW_EDIT_SOURCES);
      if (files.length === 0) return [];
      const newest = Math.max(...files.map((file) => Date.parse(file.modifiedAt)));
      const readyAtMs = newest + AUTO_START_SETTLE_MS + (files.length > 1 ? AUTO_START_EXTRA_MS : 0);
      return [{ showDate, files, ready: options.now.getTime() >= readyAtMs, readyAt: new Date(readyAtMs).toISOString() }];
    });
}

/** Recordings the picker shows before "Show older". */
export const RECORDINGS_SHOWN = 6;

/** Files newest first: the newest 6, plus older ones already ticked (in order); `hidden` counts the rest. */
export function visibleRecordings(files: ShowRecording[], chosen: ReadonlySet<string>, showAll: boolean) {
  if (showAll) return { shown: files, hidden: 0 };
  const shown = files.filter((file, index) => index < RECORDINGS_SHOWN || chosen.has(file.path));
  return { shown, hidden: files.length - shown.length };
}
