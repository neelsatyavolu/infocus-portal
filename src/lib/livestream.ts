/**
 * Livestream master tracker — semester windows and hour-based credit.
 *
 * Required: 8 hours per semester for full credit. Partial is proportional
 * (e.g. 4 hours = 50%). Points scale against MAX_LIVESTREAM_POINTS (40; 5/hour).
 *
 * Semester windows (calendar dates, fixed each year):
 *   S1: Aug 13 – Dec 18
 *   S2: Jan 5  – Jun 3
 */

import { MAX_LIVESTREAM_POINTS } from "@/src/lib/grading";

export const REQUIRED_LIVESTREAM_HOURS = 8;
export const DEFAULT_LIVESTREAM_CAPACITY = 4;

export type SemesterTerm = 1 | 2;

export type AcademicSemester = {
  /** Calendar year the academic year starts (e.g. 2025 for 2025–26). */
  academicYearStart: number;
  term: SemesterTerm;
  /** e.g. "2025-26 S1" */
  label: string;
  /** Inclusive start (UTC midnight). */
  start: Date;
  /** Inclusive end (UTC end-of-day). */
  end: Date;
};

function utcDate(year: number, month: number, day: number, endOfDay = false): Date {
  if (endOfDay) {
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function semesterBounds(academicYearStart: number, term: SemesterTerm): AcademicSemester {
  const yy = String(academicYearStart + 1).slice(-2);
  if (term === 1) {
    return {
      academicYearStart,
      term: 1,
      label: `${academicYearStart}-${yy} S1`,
      start: utcDate(academicYearStart, 8, 13),
      end: utcDate(academicYearStart, 12, 18, true)
    };
  }

  return {
    academicYearStart,
    term: 2,
    label: `${academicYearStart}-${yy} S2`,
    start: utcDate(academicYearStart + 1, 1, 5),
    end: utcDate(academicYearStart + 1, 6, 3, true)
  };
}

/**
 * Map a date onto the academic semester it falls in (or the most recent one
 * during summer / winter breaks).
 */
export function semesterForDate(date: Date = new Date()): AcademicSemester {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();

  // Jan 1–4: winter break after S1 → stay on S1 of AY that started previous year
  if (m === 1 && d < 5) {
    return semesterBounds(y - 1, 1);
  }

  // Jan 5 – Jun 3: S2 of AY that started previous calendar year
  if (m < 6 || (m === 6 && d <= 3)) {
    return semesterBounds(y - 1, 2);
  }

  // Jun 4 – Aug 12: summer after S2
  if (m < 8 || (m === 8 && d < 13)) {
    return semesterBounds(y - 1, 2);
  }

  // Aug 13 – Dec 31: S1 of AY starting this calendar year
  return semesterBounds(y, 1);
}

export function isDateInSemester(date: Date, semester: AcademicSemester) {
  const t = date.getTime();
  return t >= semester.start.getTime() && t <= semester.end.getTime();
}

/** S1 grades begin November 30 at midnight Pacific (PST); S2 timing is unchanged. */
export function livestreamGradesReleased(at: Date, semester = semesterForDate(at)) {
  const release = semester.term === 1
    ? Date.UTC(semester.academicYearStart, 10, 30, 8)
    : semester.start.getTime();
  return at.getTime() >= release;
}

/** Fraction of full credit from completed hours (0–1). */
export function livestreamCreditFraction(completedHours: number) {
  if (!Number.isFinite(completedHours) || completedHours <= 0) {
    return 0;
  }
  return Math.min(1, completedHours / REQUIRED_LIVESTREAM_HOURS);
}

/**
 * Convert completed hours → package-category livestream points.
 * 8h → MAX_LIVESTREAM_POINTS (40); 4h → 20; over-hours capped at max.
 */
export function livestreamPointsFromHours(completedHours: number): number {
  return Math.round(livestreamCreditFraction(completedHours) * MAX_LIVESTREAM_POINTS);
}

export type CapacityTone = "full" | "one" | "open";

export function capacityTone(attendeeCount: number, capacity: number): CapacityTone {
  const open = Math.max(0, capacity - attendeeCount);
  if (open <= 0) return "full";
  if (open === 1) return "one";
  return "open";
}

export const LIVESTREAM_STATUS_LABELS = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
} as const;

export const LIVESTREAM_AVAILABILITY_LABELS = {
  PUBLIC: "Public",
  UNLISTED: "Unlisted",
  UNCONFIRMED: "Unconfirmed"
} as const;

/** Zero event hours cancels credit for everyone, including individual overrides. */
export function livestreamAttendeeHours(eventHours: number | null, creditHours: number | null) {
  if (!eventHours) return 0;
  return creditHours ?? eventHours;
}
