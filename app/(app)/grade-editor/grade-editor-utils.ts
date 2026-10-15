import { numericGradeScore } from "@/src/lib/grade-score";
import { packageSubtotal } from "@/src/lib/grade-editor-summary";
import { defaultTotalsAdjustments, type TotalsAdjustments } from "@/src/lib/grade-editor-csv";
import { PACKAGE_CYCLE_NUMBERS } from "@/src/lib/package-grades";
import type { StatusTone } from "@/components/kit/tone";
import {
  MAX_CHECK_INS_PER_CYCLE,
  MAX_FINAL,
  MAX_LIVESTREAM,
  MAX_PACKAGE_PER_CYCLE,
  type CycleFilter,
  type CycleTab,
  type GradeMutationPayload,
  type GradeRow,
  type MissingPayload,
  type MissingStatus,
  type SortBy,
  type TotalsRow,
  type ViewMode
} from "./grade-editor-types";

/** Pure helpers for the Grade Editor (no React, no fetching). */

export function adjustmentsFromTotalsRow(row: TotalsRow): TotalsAdjustments {
  return {
    ...defaultTotalsAdjustments(),
    checkIns: row.checkInPoints ?? null,
    livestream: row.livestreamPoints ?? null,
    final: row.portfolioPoints ?? null,
    notes: row.notes
  };
}

/**
 * A reporter's Total-view numbers after fresh totals land. Check-ins, Livestream and Final take
 * the new official credit unless someone typed over the value seeded from `previous` (the row
 * that seeded it: an earlier load, or the cached copy shown on return). A saved check-in override
 * (`checkInStale`) always takes the new check-ins. Notes take the saved note unless one is still
 * waiting to save (`keepNotes`). Temporary cycle overrides and extra credit are kept.
 */
export function mergeTotalsAdjustments({
  existing,
  previous,
  row,
  checkInStale,
  keepNotes
}: {
  existing: TotalsAdjustments | undefined;
  previous: TotalsRow | undefined;
  row: TotalsRow;
  checkInStale: boolean;
  keepNotes: boolean;
}): TotalsAdjustments {
  const fresh = adjustmentsFromTotalsRow(row);
  if (!existing) return fresh;
  const oldSeed = previous ? adjustmentsFromTotalsRow(previous) : null;
  const untouched = (field: "checkIns" | "livestream" | "final") => oldSeed !== null && existing[field] === oldSeed[field];
  return {
    ...existing,
    notes: keepNotes ? existing.notes : row.notes,
    checkIns: checkInStale || untouched("checkIns") ? fresh.checkIns : existing.checkIns,
    livestream: untouched("livestream") ? fresh.livestream : existing.livestream,
    final: untouched("final") ? fresh.final : existing.final
  };
}

export function clampNonNegative(input: string) {
  if (!input.trim()) return 0;
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

export function letterGrade(percentage: number) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

/** A percentage to one decimal, as the Grade Editor has always shown it ("89.6%"). */
export function formatPercent(percent: number | null) {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

export function personLabel(person: { name: string | null }) {
  return person.name?.trim() || "Unnamed user";
}

export function rowLabel(row: GradeRow) {
  return personLabel(row);
}

/** The part of an email before the @, or a dash. */
export function emailLocalPart(email: string | null) {
  return email?.split("@")[0] ?? "—";
}

export function isRowFilledIn(row: Pick<GradeRow, "effortPoints" | "teamworkPoints">) {
  return row.effortPoints !== null;
}

export function rowHasUnsavedChanges(row: GradeRow, baseline?: GradeRow) {
  if (!baseline) return true;

  return (
    row.finalCutState !== baseline.finalCutState ||
    (row.effortPoints ?? null) !== (baseline.effortPoints ?? null) ||
    (row.teamworkPoints ?? null) !== (baseline.teamworkPoints ?? null) ||
    row.feedback !== baseline.feedback ||
    (row.turnedInDate ?? null) !== (baseline.turnedInDate ?? null)
  );
}

function getDaySuffix(day: number) {
  if (day >= 11 && day <= 13) return "th";
  const lastDigit = day % 10;
  if (lastDigit === 1) return "st";
  if (lastDigit === 2) return "nd";
  if (lastDigit === 3) return "rd";
  return "th";
}

export function formatLongDate(value: string | null) {
  if (!value) {
    return "Not set yet";
  }

  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return value;
  }

  const [year, month, day] = parts;
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC"
  });
  return `${monthName} ${day}${getDaySuffix(day)}, ${year}`;
}

export function extensionExceptionSummary(row: Pick<GradeRow, "extensionDetails">) {
  if (row.extensionDetails.freeDays <= 0) {
    return null;
  }

  return `${row.extensionDetails.calculatedDays} late day${row.extensionDetails.calculatedDays === 1 ? "" : "s"}, ${row.extensionDetails.freeDays} free, ${row.extensionDetails.chargedDays} charged`;
}

export function formatHistoryTimestamp(value: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function historyEventLabel(eventType: "PUBLISHED" | "REVISED") {
  return eventType === "PUBLISHED" ? "Published" : "Revised";
}

export function applyMutationToRow(row: GradeRow, payload: GradeMutationPayload) {
  return {
    ...row,
    ...payload
  };
}

/**
 * The tables', Previous/Next and CSV order, unchanged from before the redesign: the first (or
 * last) word of the name, compared with localeCompare; ties keep the server's order.
 */
export function sortByName<T extends { name: string | null }>(people: T[], sortBy: SortBy) {
  const part = (person: T) => {
    const name = person.name?.trim() ?? "";
    return sortBy === "lastName" ? (name.split(" ").pop() ?? name) : (name.split(" ")[0] ?? name);
  };
  return [...people].sort((a, b) => part(a).localeCompare(part(b)));
}

export function matchesSearch(person: { name: string | null; email: string | null }, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (person.name?.toLowerCase() ?? "").includes(needle) || (person.email?.toLowerCase() ?? "").includes(needle);
}

/* ---------- Row status (cycle view) ---------- */

export function isMissedFinalCut(row: GradeRow) {
  return row.finalCutMissing && row.effortPoints === null && !row.finalCutState;
}

/** Filled and not published: exactly the rows Publish all publishes (and the missing report's "unpublished"). */
export function isReadyToPublish(row: GradeRow) {
  return isRowFilledIn(row) && !row.published;
}

/** No score yet (or explicitly ungraded). Exempt is excused, not missing. */
export function isNotEntered(row: GradeRow) {
  return row.effortPoints === null && row.finalCutState !== "EXEMPT";
}

/** Changed after publishing and not published again. `revised` stays true after a republish. */
export function needsRepublish(row: GradeRow) {
  return row.revised && !row.published;
}

export function isOverExtensions(row: GradeRow) {
  return row.extensionsRemaining < 0;
}

export function overExtensionsTitle(row: GradeRow) {
  return `${row.extensionsRemaining} extension day${Math.abs(row.extensionsRemaining) === 1 ? "" : "s"} left, all cycles`;
}

export type RowStatus = { label: string; tone: StatusTone; title: string };

/**
 * One label and one tone per state, used by the row tags, the filter chips and the Missing
 * grades sheet alike.
 */
export const STATUS_TONE = {
  published: "success",
  notEntered: "warning",
  unpublished: "neutral",
  revised: "warning",
  missed: "danger"
} as const satisfies Record<string, StatusTone>;

/**
 * The one status of a cycle row, most important first. Revised shows only while the change waits
 * to be published again; `revised` stays true after a republish, so a republished grade reads
 * Published and says on hover that it was revised (the publish history has the dates).
 */
export function rowStatus(row: GradeRow): RowStatus {
  if (row.published) {
    return {
      label: "Published",
      tone: STATUS_TONE.published,
      title: row.revised
        ? "The student can see this grade. It was changed after publishing, then published again"
        : "The student can see this grade"
    };
  }
  if (row.finalCutState === "EXEMPT") return { label: "Exempt", tone: "neutral", title: "Excused: left out of totals and not published" };
  if (row.finalCutState === "UNGRADED") return { label: "Ungraded", tone: "neutral", title: "Marked ungraded: left out of totals until scored" };
  if (isMissedFinalCut(row)) return { label: "Missed", tone: STATUS_TONE.missed, title: "No approved Final Cut by the deadline (counts as 0)" };
  if (row.effortPoints === null) return { label: "Not entered", tone: STATUS_TONE.notEntered, title: "No Final Cut score yet" };
  if (row.revised) return { label: "Revised", tone: STATUS_TONE.revised, title: "Changed after publishing. Publish again so the student sees it" };
  return { label: "Unpublished", tone: STATUS_TONE.unpublished, title: "Scored, not published yet" };
}

/** Why a row's Publish button is disabled, or null when it can be published. */
export function publishBlockedReason(row: GradeRow) {
  if (row.published || isRowFilledIn(row)) return null;
  if (row.finalCutState === "EXEMPT" || row.finalCutState === "UNGRADED") return "Exempt and ungraded scores are not published";
  return "Enter a Final Cut score first";
}

export function cycleFilterMatches(row: GradeRow, filter: CycleFilter, notEnteredIds: ReadonlySet<string> | null) {
  switch (filter) {
    case "to-publish":
      return isReadyToPublish(row);
    case "not-entered":
      return isNotEntered(row) && (notEnteredIds === null || notEnteredIds.has(row.userId));
    case "missed":
      return isMissedFinalCut(row);
    case "republish":
      return needsRepublish(row);
    case "over-extensions":
      return isOverExtensions(row);
    default:
      return true;
  }
}

export const CYCLE_FILTERS: CycleFilter[] = ["all", "to-publish", "not-entered", "missed", "republish", "over-extensions"];

export function isCycleFilter(value: unknown): value is CycleFilter {
  return typeof value === "string" && (CYCLE_FILTERS as string[]).includes(value);
}

export function cycleFilterCounts(rows: GradeRow[], notEnteredIds: ReadonlySet<string> | null) {
  const counts: Record<CycleFilter, number> = {
    all: rows.length,
    "to-publish": 0,
    "not-entered": 0,
    missed: 0,
    republish: 0,
    "over-extensions": 0
  };
  for (const row of rows) {
    for (const filter of CYCLE_FILTERS) {
      if (filter !== "all" && cycleFilterMatches(row, filter, notEnteredIds)) counts[filter] += 1;
    }
  }
  return counts;
}

/* ---------- Total view maths (unchanged from the original table) ---------- */

export function totalsRowSummary(
  row: TotalsRow,
  adjustments: TotalsAdjustments,
  payloadCheckInPossible: number,
  cycleCount: number
) {
  const checkInMax =
    row.checkInPossible && row.checkInPossible > 0
      ? row.checkInPossible
      : payloadCheckInPossible > 0
        ? payloadCheckInPossible
        : cycleCount * MAX_CHECK_INS_PER_CYCLE;
  const packages = packageSubtotal(row.cycleTotals, adjustments.cycleOverrides, MAX_PACKAGE_PER_CYCLE);
  const totalGrade =
    packages.earned +
    (numericGradeScore(adjustments.checkIns) ?? 0) +
    (numericGradeScore(adjustments.livestream) ?? 0) +
    row.participationEarned +
    (numericGradeScore(adjustments.final) ?? 0) +
    (numericGradeScore(adjustments.extraPoints) ?? 0);
  const totalMax =
    packages.possible +
    (typeof adjustments.checkIns !== "number" ? 0 : checkInMax) +
    (typeof adjustments.livestream !== "number" ? 0 : MAX_LIVESTREAM) +
    row.participationPossible +
    (typeof adjustments.final !== "number" ? 0 : MAX_FINAL) +
    (typeof adjustments.extraPoints === "number" ? adjustments.extraMax : 0);
  const totalPct = totalMax > 0 ? (totalGrade / totalMax) * 100 : null;
  return { checkInMax, packages, totalGrade, totalMax, totalPct };
}

export type TotalsSummary = ReturnType<typeof totalsRowSummary>;

/** The page-wide maximum shown in the Total header: 50×cycles + 20×cycles + 40 livestream + 100 portfolio. */
export function totalsMaxPoints(cycleCount: number) {
  return cycleCount * MAX_PACKAGE_PER_CYCLE + cycleCount * MAX_CHECK_INS_PER_CYCLE + MAX_LIVESTREAM + MAX_FINAL;
}

/**
 * The temporary override for a Total-view cycle cell. Returns the next overrides map, or
 * undefined when the typed text is rejected. '' clears; '-', '—', '\' are kept raw; digits clamp to 50.
 */
export function nextCycleOverrides(current: Record<number, string>, cycleNumber: number, raw: string) {
  const nextOverrides = { ...current };
  if (raw === "") {
    delete nextOverrides[cycleNumber];
  } else if (raw === "-" || raw === "—" || raw === "\\") {
    nextOverrides[cycleNumber] = raw;
  } else if (/^\d*$/.test(raw)) {
    nextOverrides[cycleNumber] = String(Math.min(MAX_PACKAGE_PER_CYCLE, Number(raw)));
  } else {
    return undefined;
  }
  return nextOverrides;
}

/** True when a reporter's Total-view numbers differ from what was loaded (notes save on their own). */
export function hasTemporaryEdits(row: TotalsRow, adjustments: TotalsAdjustments | undefined) {
  if (!adjustments) return false;
  const seed = adjustmentsFromTotalsRow(row);
  return (
    adjustments.checkIns !== seed.checkIns ||
    adjustments.livestream !== seed.livestream ||
    adjustments.final !== seed.final ||
    adjustments.extraPoints !== seed.extraPoints ||
    adjustments.extraMax !== seed.extraMax ||
    Object.keys(adjustments.cycleOverrides).length > 0
  );
}

/* ---------- Missing report ---------- */

/** Per cycle: people (not excluded) with a missing or unpublished grade. */
export function missingCountsByCycle(report: MissingPayload | null, excludedIds: readonly string[]) {
  const counts = new Map<number, number>();
  if (!report) return counts;
  for (const person of report.missingReport) {
    if (excludedIds.includes(person.userId)) continue;
    for (const entry of person.missing) {
      counts.set(entry.cycleNumber, (counts.get(entry.cycleNumber) ?? 0) + 1);
    }
  }
  return counts;
}

/** People not entered for one cycle, by the missing report's rules (associates only on their cycles). */
export function notEnteredIdsForCycle(report: MissingPayload | null, cycleNumber: number): ReadonlySet<string> | null {
  if (!report) return null;
  const ids = new Set<string>();
  for (const person of report.missingReport) {
    if (person.missing.some((entry) => entry.cycleNumber === cycleNumber && entry.status === "not_entered")) {
      ids.add(person.userId);
    }
  }
  return ids;
}

function missingStatusForRow(row: GradeRow): MissingStatus | null {
  if (row.published || row.finalCutState === "EXEMPT") return null;
  if (row.effortPoints === null) return "not_entered";
  return "unpublished";
}

/**
 * Keeps the in-memory missing report in step after a save or publish on one row, so the counts
 * on the Missing button and the cycle tabs agree with the table without refetching. A cycle the
 * report doesn't consider yet is left alone (the next fetch picks it up).
 */
export function patchMissingReport(report: MissingPayload, row: GradeRow, cycleNumber: number): MissingPayload {
  if (!report.consideredCycleNumbers.includes(cycleNumber)) return report;
  const status = missingStatusForRow(row);
  const existing = report.missingReport.find((person) => person.userId === row.userId);
  const others = (existing?.missing ?? []).filter((entry) => entry.cycleNumber !== cycleNumber);
  const missing = status ? [...others, { cycleNumber, status }].sort((a, b) => a.cycleNumber - b.cycleNumber) : others;

  if (!existing) {
    if (!status) return report;
    return {
      ...report,
      missingReport: [...report.missingReport, { userId: row.userId, name: row.name, email: row.email, missing }]
    };
  }
  return {
    ...report,
    missingReport:
      missing.length === 0
        ? report.missingReport.filter((person) => person.userId !== row.userId)
        : report.missingReport.map((person) => (person.userId === row.userId ? { ...person, missing } : person))
  };
}

/* ---------- Views ---------- */

export type ViewKey = "total" | "student" | `cycle:${number}`;

export function viewKey(viewMode: ViewMode, cycleNumber: number): ViewKey {
  return viewMode === "cycle" ? `cycle:${cycleNumber}` : viewMode;
}

export function parseViewKey(value: unknown): { viewMode: ViewMode; cycleNumber: number | null } | null {
  if (value === "total" || value === "student") return { viewMode: value, cycleNumber: null };
  if (typeof value !== "string") return null;
  const match = /^cycle:(\d{1,2})$/.exec(value);
  const cycleNumber = match ? Number(match[1]) : NaN;
  if (!(PACKAGE_CYCLE_NUMBERS as readonly number[]).includes(cycleNumber)) return null;
  return { viewMode: "cycle", cycleNumber };
}

/**
 * The cycle being graded: the latest one whose Final Cut date has passed, or null. `today` is a
 * Pacific YYYY-MM-DD key (pacificDateKey), since a Final Cut closes at 11:59 PM Pacific on its date.
 */
export function latestPassedCycle(cycles: CycleTab[], today: string) {
  const passed = cycles.filter((cycle) => cycle.finalCutDate !== null && cycle.finalCutDate < today);
  if (passed.length === 0) return null;
  return passed.reduce((latest, cycle) => (cycle.cycleNumber > latest.cycleNumber ? cycle : latest)).cycleNumber;
}
