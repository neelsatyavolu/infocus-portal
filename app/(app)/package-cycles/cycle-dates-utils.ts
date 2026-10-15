/**
 * Pure helpers for the Cycle Dates page (/package-cycles): ordering, the next deadline, date
 * wording and draft bookkeeping. No React and no fetches, so they're easy to test.
 * "Today" is the browser's local midnight, as before (deadlines close 11:59 PM Pacific).
 */

import { relativeDaysLabel } from "@/components/kit/tone";

export type PackageCycle = {
  cycleNumber: number;
  /** Not shown on this page, but always sent back on save so the stored value is kept. */
  focus: string;
  pitchingDate: string | null;
  proofOfContactDate: string | null;
  aRollBRollDate: string | null;
  initialCutDate: string | null;
  finalCutDate: string | null;
};

export type PackageCyclesResponse = {
  canEdit: boolean;
  canEditCycleCount: boolean;
  cyclesPerSemester: number;
  cycles: PackageCycle[];
};

export const STAGE_FIELDS = [
  { key: "pitchingDate", label: "Package Pitching", short: "Pitching" },
  { key: "proofOfContactDate", label: "Brainstorming & Proof of Contact", short: "Proof of Contact" },
  { key: "aRollBRollDate", label: "A-roll/B-roll", short: "A/B-roll" },
  { key: "initialCutDate", label: "Initial Cut", short: "Initial Cut" },
  { key: "finalCutDate", label: "Final Cut", short: "Final Cut" }
] as const;

export type StageField = (typeof STAGE_FIELDS)[number];
export type StageKey = StageField["key"];

export const MIN_CYCLES = 1;
export const MAX_CYCLES = 8;

const DAY_MS = 86_400_000;
const NBSP = " ";

export function startOfToday(now: Date = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseDateKey(dateKey: string | null | undefined) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days from today to `date` (0 = today, negative = past). */
export function daysFrom(date: Date, today: Date) {
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

/**
 * "Thu, Oct 16" (non-breaking, so it never splits), plus ", 2027" only when the year isn't
 * this year. The year can wrap to its own line in a narrow column.
 */
export function formatDateShort(date: Date, today: Date) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const base = `${weekday},${NBSP}${month}${NBSP}${date.getDate()}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/** "Thursday, October 16, 2026" for hover text and screen readers. */
export function formatDateFull(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatWeekday(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/** The hint under a date field: "Thu · in 3d", "Thu · Today", "Thu · Completed", or "No date". */
export function stageHint(dateKey: string | null, today: Date) {
  const date = parseDateKey(dateKey);
  if (!date) return "No date";
  const days = daysFrom(date, today);
  return `${formatWeekday(date)} · ${days < 0 ? "Completed" : relativeDaysLabel(days)}`;
}

/** The month a cycle is named for (Proof of Contact, else Final Cut), e.g. "October". */
export function cycleMonth(cycle: PackageCycle) {
  const anchor = parseDateKey(cycle.proofOfContactDate ?? cycle.finalCutDate);
  return anchor ? anchor.toLocaleDateString("en-US", { month: "long" }) : null;
}

/** "Cycle 2 · October", or "Cycle 2" with no anchor date. */
export function cycleTitle(cycle: PackageCycle) {
  const month = cycleMonth(cycle);
  return month ? `Cycle ${cycle.cycleNumber} · ${month}` : `Cycle ${cycle.cycleNumber}`;
}

export function pluralCycles(count: number) {
  return `${count} cycle${count === 1 ? "" : "s"}`;
}

export function sortCycles(cycles: readonly PackageCycle[]) {
  return [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
}

/** Closed once its Final Cut date has passed. A cycle with no Final Cut date never closes. */
export function isCycleClosed(cycle: PackageCycle, today: Date) {
  const finalCut = parseDateKey(cycle.finalCutDate);
  return finalCut ? finalCut.getTime() < today.getTime() : false;
}

export type CycleSection = "current" | "upcoming" | "closed";
export type OrderedCycle = { cycle: PackageCycle; section: CycleSection };

/** The first open cycle (current), the other open cycles (upcoming), then closed cycles. */
export function orderCycles(cycles: readonly PackageCycle[], today: Date): OrderedCycle[] {
  const sorted = sortCycles(cycles);
  const open = sorted.filter((cycle) => !isCycleClosed(cycle, today));
  const closed = sorted.filter((cycle) => isCycleClosed(cycle, today));
  return [
    ...open.map((cycle, index): OrderedCycle => ({ cycle, section: index === 0 ? "current" : "upcoming" })),
    ...closed.map((cycle): OrderedCycle => ({ cycle, section: "closed" }))
  ];
}

export const SECTION_LABEL: Record<CycleSection, string> = {
  current: "Active",
  upcoming: "Planned",
  closed: "Closed"
};

export const SECTION_TONE: Record<CycleSection, "success" | "neutral" | "muted"> = {
  current: "success",
  upcoming: "neutral",
  closed: "muted"
};

/** A cycle's next stage: the first stage IN STAGE ORDER dated today or later. */
export function nextStageKey(cycle: PackageCycle, today: Date): StageKey | null {
  const stage = STAGE_FIELDS.find((field) => {
    const date = parseDateKey(cycle[field.key]);
    return date ? date.getTime() >= today.getTime() : false;
  });
  return stage?.key ?? null;
}

export type Deadline = {
  cycleNumber: number;
  stage: StageField;
  date: Date;
  days: number;
};

/**
 * The soonest date on or after today across every cycle that hasn't closed (cycles overlap).
 * Ties go to the lower cycle, then the earlier stage, the same as Class Board.
 */
export function soonestDeadline(cycles: readonly PackageCycle[], today: Date): Deadline | null {
  const candidates = sortCycles(cycles)
    .filter((cycle) => !isCycleClosed(cycle, today))
    .flatMap((cycle) =>
      STAGE_FIELDS.flatMap((stage, order) => {
        const date = parseDateKey(cycle[stage.key]);
        if (!date || date.getTime() < today.getTime()) return [];
        return [{ cycleNumber: cycle.cycleNumber, stage, date, days: daysFrom(date, today), order }];
      })
    )
    .sort((a, b) => a.days - b.days || a.cycleNumber - b.cycleNumber || a.order - b.order);
  const first = candidates[0];
  return first ? { cycleNumber: first.cycleNumber, stage: first.stage, date: first.date, days: first.days } : null;
}

export function hasAnyDate(cycles: readonly PackageCycle[]) {
  return cycles.some((cycle) => STAGE_FIELDS.some((stage) => parseDateKey(cycle[stage.key])));
}

/** True when a draft differs from its saved copy (any date, or the hidden focus text). */
export function isDirty(draft: PackageCycle, saved: PackageCycle | undefined) {
  if (!saved) return false;
  return draft.focus !== saved.focus || STAGE_FIELDS.some((stage) => (draft[stage.key] ?? null) !== (saved[stage.key] ?? null));
}

export function dirtyCycleNumbers(drafts: readonly PackageCycle[], saved: readonly PackageCycle[]) {
  return drafts
    .filter((draft) => isDirty(draft, saved.find((entry) => entry.cycleNumber === draft.cycleNumber)))
    .map((draft) => draft.cycleNumber);
}

/**
 * New saved data, keeping any draft that had unsaved changes (Refresh and Save count no longer
 * wipe them). Cycles that are gone (count lowered) drop out with their drafts.
 */
export function mergeDrafts(previousSaved: readonly PackageCycle[], previousDrafts: readonly PackageCycle[], nextSaved: readonly PackageCycle[]) {
  return sortCycles(nextSaved).map((cycle) => {
    const draft = previousDrafts.find((entry) => entry.cycleNumber === cycle.cycleNumber);
    const before = previousSaved.find((entry) => entry.cycleNumber === cycle.cycleNumber);
    return draft && isDirty(draft, before) ? draft : cycle;
  });
}

/** Replaces one cycle by number (immutable) and keeps the list sorted. */
export function replaceCycle(cycles: readonly PackageCycle[], next: PackageCycle) {
  return sortCycles(cycles.map((cycle) => (cycle.cycleNumber === next.cycleNumber ? next : cycle)));
}

/** Saved cycles plus the editor's drafts, kept together so a reload can keep unsaved drafts. */
export type Schedule = { saved: PackageCycle[]; drafts: PackageCycle[] };

/** Fresh data from the server. Drafts with unsaved changes stay (see mergeDrafts). */
export function withServerCycles(previous: Schedule | null, cycles: readonly PackageCycle[]): Schedule {
  const saved = sortCycles(cycles);
  return { saved, drafts: previous ? mergeDrafts(previous.saved, previous.drafts, saved) : saved };
}

/**
 * A cycle save came back. The server's copy becomes the saved copy, and the draft too, unless
 * the draft was edited again while the save ran (then the newer draft stays, still unsaved).
 */
export function withSavedCycle(schedule: Schedule, result: PackageCycle, sent: PackageCycle): Schedule {
  const draft = schedule.drafts.find((cycle) => cycle.cycleNumber === result.cycleNumber);
  return {
    saved: replaceCycle(schedule.saved, result),
    drafts: draft && isDirty(draft, sent) ? schedule.drafts : replaceCycle(schedule.drafts, result)
  };
}

/**
 * Where each cycle sits while editing, fixed when editing starts so rows never jump when a save
 * moves a cycle to another section: the open cycles in schedule order, then the closed ones.
 */
export type EditLayout = { open: number[]; closed: number[] };

export function editLayoutFrom(ordered: readonly OrderedCycle[]): EditLayout {
  return {
    open: ordered.filter((entry) => entry.section !== "closed").map((entry) => entry.cycle.cycleNumber),
    closed: ordered.filter((entry) => entry.section === "closed").map((entry) => entry.cycle.cycleNumber)
  };
}

/**
 * The drafts in edit-layout order. Cycles added since editing began (count raised) join the open
 * group in cycle order; cycles that are gone (count lowered) drop out.
 */
export function editRows(layout: EditLayout, drafts: readonly PackageCycle[]) {
  const pick = (numbers: number[]) =>
    numbers.flatMap((cycleNumber) => drafts.filter((draft) => draft.cycleNumber === cycleNumber));
  const placed = new Set([...layout.open, ...layout.closed]);
  const added = sortCycles(drafts.filter((draft) => !placed.has(draft.cycleNumber)));
  return { open: [...pick(layout.open), ...added], closed: pick(layout.closed) };
}

export function withStageDate(cycle: PackageCycle, key: StageKey, value: string | null): PackageCycle {
  return { ...cycle, [key]: value };
}

/** Clamp to 1–8 and drop decimals; anything unreadable becomes 1 (same rule as before). */
export function clampCycleCount(value: number) {
  if (!Number.isFinite(value)) return MIN_CYCLES;
  return Math.min(MAX_CYCLES, Math.max(MIN_CYCLES, Math.trunc(value) || MIN_CYCLES));
}

/** The count typed in the field, or null while it's empty. */
export function parseCycleCount(text: string) {
  return text.trim() === "" ? null : clampCycleCount(Number(text));
}

/**
 * The stage before `index` that has a later date than this one, if any ("Earlier than Package
 * Pitching"). A hint only; saving still works.
 */
export function earlierThanStage(cycle: PackageCycle, index: number) {
  const date = parseDateKey(cycle[STAGE_FIELDS[index].key]);
  if (!date) return null;
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const before = parseDateKey(cycle[STAGE_FIELDS[previous].key]);
    if (before) return before.getTime() > date.getTime() ? STAGE_FIELDS[previous] : null;
  }
  return null;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
