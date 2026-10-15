import { MAX_FINAL_CUT_POINTS, MAX_LIVESTREAM_POINTS, MAX_PORTFOLIO_POINTS } from "@/src/lib/grading";
import { cycleSemesterTerm, parseSemesterTerm } from "@/src/lib/package-grades";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";
import type { GradebookDay, GradebookWeek } from "@/src/lib/student-gradebook";
import type { EstimatedPayload, GradeTile, Totals } from "@/components/grades/grades-types";

/**
 * Pure helpers for the student Grades screen. The maths here is the same as the old single-file
 * client; the redesign only moved it so the views can share it.
 */

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** The school's time zone, so server and browser print the same date (no hydration mismatch). */
const SCHOOL_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

/** Percent to one decimal, or null when nothing is gradeable. The one percent helper on this screen. */
export function pctOf(earned: number, possible: number) {
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

function sumGraded(values: Array<number | null>) {
  return values.reduce(
    (acc, value) => {
      if (value === null) return acc;
      return { earned: acc.earned + value, count: acc.count + 1 };
    },
    { earned: 0, count: 0 }
  );
}

/** Graded final cuts × 50 plus graded check-ins (livestream is not in this sum). */
export function packageTotalsOf(estimated: EstimatedPayload | undefined): Totals {
  const finals = sumGraded(estimated?.packages.finalCutPoints ?? []);
  const checkPoints = estimated?.packages.checkInPoints ?? [];
  const checkPossible = estimated?.packages.checkInPossible ?? [];
  const checks = sumGraded(checkPoints);
  const possibleChecks = checkPoints.reduce<number>((total, earned, index) => {
    if (earned === null) return total;
    return total + (checkPossible[index] ?? MAX_CHECK_IN_POINTS_PER_CYCLE);
  }, 0);
  return {
    earned: finals.earned + checks.earned,
    possible: finals.count * MAX_FINAL_CUT_POINTS + possibleChecks
  };
}

/** Livestream + portfolio, each counted only once it is graded (the "Other" grouping; UI only). */
export function otherTotalsOf(estimated: EstimatedPayload | undefined): Totals {
  const livestream = estimated?.packages.livestreamPoints ?? null;
  const portfolio = estimated?.portfolio.points ?? null;
  return {
    earned: (livestream ?? 0) + (portfolio ?? 0),
    possible: (livestream === null ? 0 : MAX_LIVESTREAM_POINTS) + (portfolio === null ? 0 : MAX_PORTFOLIO_POINTS)
  };
}

/** Cycles of the gradebook's semester; every cycle when the label has no S1/S2. */
export function semesterCyclesOf<T extends { cycleNumber: number }>(ordered: T[], semesterLabel: string | undefined) {
  const term = parseSemesterTerm(semesterLabel ?? "");
  return ordered.filter((cycle) => term === null || cycleSemesterTerm(cycle.cycleNumber) === term);
}

/**
 * A cycle's scores. The estimated arrays follow ALL cycles in order (`scoreCycles`), not the
 * semester-filtered list, so the index is the cycle's position there.
 */
export function cycleScoresOf(scoreCycles: GradeTile[], cycleNumber: number, estimated: EstimatedPayload | undefined) {
  const index = scoreCycles.findIndex((entry) => entry.cycleNumber === cycleNumber);
  if (index < 0) return { finalCut: null, checkIn: null, checkPossible: null };
  return {
    finalCut: estimated?.packages.finalCutPoints[index] ?? null,
    checkIn: estimated?.packages.checkInPoints[index] ?? null,
    checkPossible: estimated?.packages.checkInPossible?.[index] ?? null
  };
}

/** The full topic, or a month name for a cycle with no focus yet. */
export function cycleTopic(cycle: Pick<GradeTile, "cycleNumber" | "focus">) {
  const focus = cycle.focus?.trim();
  return focus || MONTH_LABELS[(cycle.cycleNumber - 1) % 12];
}

type CycleStatus = {
  label: string;
  tone: "neutral" | "success" | "warning";
  /** The longer wording, for the tag's hover text. */
  detail: string;
};

export function cycleStatusOf(cycle: Pick<GradeTile, "published" | "revised">): CycleStatus {
  if (!cycle.published) return { label: "In progress", tone: "neutral", detail: "Grading not yet published" };
  if (cycle.revised) return { label: "Published · revised", tone: "warning", detail: "Revised grade reviewed" };
  return { label: "Published", tone: "success", detail: "Producer feedback published" };
}

/** Whole hours print as "6", partial as "6.5" (same as the dashboard's Grade card). */
export function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function dayKindLabel(day: Pick<GradebookDay, "kind" | "maxPoints">) {
  if (day.kind === "PA") return "PA";
  if (day.kind === "SHOW") return "Show";
  if (day.kind === "HOLIDAY") return "Holiday";
  return day.maxPoints > 0 ? "Class" : "Off";
}

/** "2026-10-12" → "Oct 12" (read as a UTC calendar date, like the gradebook builds it). */
export function shortDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return SHORT_DATE.format(new Date(Date.UTC(year, month - 1, day)));
}

/** An ISO timestamp as "Oct 12" in the school's time zone, or null when it doesn't parse. */
export function shortDateFromIso(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : SCHOOL_DATE.format(date);
}

/** Days that count: a class day (max > 0) or a day that already has a score. */
export function classDaysOf(week: GradebookWeek | null) {
  return (week?.days ?? []).filter((day) => day.maxPoints > 0 || day.points !== null);
}

/** "55%" from a 0–1 weight. */
export function weightLabel(weight: number) {
  return `${Math.round(weight * 100)}%`;
}
