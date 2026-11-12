import { z } from "zod";
import { semesterForDate } from "@/src/lib/livestream";

/**
 * A portfolio row can exist before it is graded (the student submitted a link first); its
 * points are null until then and count for neither earned nor possible points.
 */
export function portfolioPointsOrNull(points: number | null | undefined): number | null {
  return points ?? null;
}

/** Semester label (e.g. "2026-27 S1") the portfolio belongs to; the current one by default. */
export function currentPortfolioSemester(now: Date = new Date()) {
  return semesterForDate(now).label;
}

export const portfolioSemesterSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2} S[12]$/, "Semester must look like 2026-27 S1.");

export const portfolioLinkSchema = z
  .string()
  .trim()
  .max(2000, "Link is too long.")
  .url("Enter a full link starting with https://.")
  .refine((value) => value.toLowerCase().startsWith("https://"), "Use an https:// link.");
