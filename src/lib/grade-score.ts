import type { GradeScoreState } from "@prisma/client";

export type GradeScore = number | GradeScoreState | null;

/** Undefined rejects invalid text without silently grading it as zero. */
export function parseGradeScore(value: string, max: number): GradeScore | undefined {
  const text = value.trim();
  if (!text || text === "-" || text === "—") return "UNGRADED";
  if (text === "\\") return "EXEMPT";
  if (!/^\d+(?:\.\d*)?$/.test(text)) return undefined;
  return Math.min(max, Math.round(Number(text)));
}

export function gradeScoreInput(value: GradeScore): string {
  if (value === "EXEMPT") return "\\";
  // Let the dash placeholder represent ungraded so clearing leaves room to type a number.
  if (value === "UNGRADED") return "";
  return value === null ? "" : String(value);
}

export function gradeScoreLabel(value: GradeScore): string {
  if (value === "EXEMPT") return "Exempt";
  if (value === null || value === "UNGRADED") return "—";
  return String(value);
}

export function numericGradeScore(value: GradeScore): number | null {
  return typeof value === "number" ? value : null;
}
