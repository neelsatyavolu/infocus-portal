import { gradeScoreLabel, numericGradeScore, parseGradeScore, type GradeScore } from "@/src/lib/grade-score";
import type { GradeScoreState } from "@prisma/client";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";

const MAX_PACKAGE_PER_CYCLE = 50;
const MAX_LIVESTREAM = 40;
const MAX_FINAL = 100;

export type TotalsAdjustments = {
  checkIns: GradeScore;
  livestream: GradeScore;
  final: GradeScore;
  extraPoints: GradeScore;
  extraMax: number;
  cycleOverrides: Record<number, string>;
  notes: string;
};

type CycleCsvRow = {
  finalCutState?: GradeScoreState | null;
  name: string | null;
  email: string | null;
  effortPoints: number | null;
  teamworkPoints: number | null;
  feedback: string;
  turnedInDate: string | null;
  extensionsRemaining: number;
  published: boolean;
  revised: boolean;
};

type TotalCsvCycle = {
  cycleNumber: number;
};

type TotalCsvRow = {
  checkInPossible?: number | null;
  participationEarned: number;
  participationPossible: number;
  name: string | null;
  email: string | null;
  cycleTotals: Array<{
    cycleNumber: number;
    totalPoints: number | null;
    finalCutState?: GradeScoreState | null;
  }>;
  adjustments: TotalsAdjustments;
};

export function defaultTotalsAdjustments(): TotalsAdjustments {
  return {
    checkIns: null,
    livestream: null,
    final: null,
    extraPoints: 0,
    extraMax: 0,
    cycleOverrides: {},
    notes: ""
  };
}

function optionalScore(value: GradeScore) {
  return numericGradeScore(value) ?? 0;
}

function optionalMax(value: GradeScore, maxValue: number) {
  return typeof value === "number" ? maxValue : 0;
}

function letterGrade(percentage: number) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

function csvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;

  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function csvLine(values: Array<string | number | null | undefined>) {
  return values.map(csvValue).join(",");
}

function rowName(name: string | null) {
  return name?.trim() || "Unnamed user";
}

export function buildCycleGradesCsv({
  cycleNumber,
  rows
}: {
  cycleNumber: number;
  rows: CycleCsvRow[];
}) {
  const lines = [
    csvLine([
      "Cycle",
      "Name",
      "Email",
      "Final Cut Points",
      "Teamwork Points",
      "Total Points",
      "Percentage",
      "Turned In Date",
      "Extensions Remaining",
      "Published",
      "Revised",
      "Feedback"
    ])
  ];

  for (const row of rows) {
    const score = row.finalCutState ?? row.effortPoints;
    const total = numericGradeScore(score);
    lines.push(
      csvLine([
        cycleNumber,
        rowName(row.name),
        row.email,
        score === null ? null : gradeScoreLabel(score),
        row.teamworkPoints,
        total,
        total === null ? null : ((total / MAX_PACKAGE_PER_CYCLE) * 100).toFixed(1),
        row.turnedInDate,
        row.extensionsRemaining,
        row.published ? "Yes" : "No",
        row.revised ? "Yes" : "No",
        row.feedback
      ])
    );
  }

  return lines.join("\n");
}

export function buildTotalGradesCsv({
  cycles,
  rows,
  checkInPossible
}: {
  cycles: TotalCsvCycle[];
  rows: TotalCsvRow[];
  checkInPossible?: number;
}) {
  const checkInMax =
    checkInPossible && checkInPossible > 0
      ? checkInPossible
      : cycles.length * MAX_CHECK_IN_POINTS_PER_CYCLE;
  const lines = [
    csvLine([
      "Name",
      "Email",
      ...cycles.map((cycle) => `Cycle ${String(cycle.cycleNumber).padStart(2, "0")}`),
      "Check-Ins",
      "Livestream",
      "Participation",
      "Final",
      "Extra Points",
      "Extra Max",
      "Total Grade",
      "Total Max",
      "Percentage",
      "Letter Grade",
      "Notes"
    ])
  ];

  for (const row of rows) {
    let packageSum = 0;
    let packageMax = 0;
    const cycleValues = cycles.map((cycle) => {
      const entry = row.cycleTotals.find((item) => item.cycleNumber === cycle.cycleNumber);
      const override = row.adjustments.cycleOverrides[cycle.cycleNumber];
      const value = entry?.totalPoints ?? (override === undefined
        ? entry?.finalCutState ?? null
        : parseGradeScore(override, MAX_PACKAGE_PER_CYCLE) ?? null);

      if (typeof value === "number") {
        packageSum += value;
        packageMax += MAX_PACKAGE_PER_CYCLE;
      }

      return value === null ? null : gradeScoreLabel(value);
    });

    const totalGrade =
      packageSum +
      optionalScore(row.adjustments.checkIns) +
      optionalScore(row.adjustments.livestream) +
      row.participationEarned +
      optionalScore(row.adjustments.final) +
      optionalScore(row.adjustments.extraPoints);
    const totalMax =
      packageMax +
      optionalMax(row.adjustments.checkIns, row.checkInPossible ?? checkInMax) +
      optionalMax(row.adjustments.livestream, MAX_LIVESTREAM) +
      row.participationPossible +
      optionalMax(row.adjustments.final, MAX_FINAL) +
      optionalMax(row.adjustments.extraPoints, row.adjustments.extraMax);
    const percentage = totalMax > 0 ? (totalGrade / totalMax) * 100 : null;

    lines.push(
      csvLine([
        rowName(row.name),
        row.email,
        ...cycleValues,
        row.adjustments.checkIns === null ? null : gradeScoreLabel(row.adjustments.checkIns),
        row.adjustments.livestream === null ? null : gradeScoreLabel(row.adjustments.livestream),
        `${row.participationEarned}/${row.participationPossible}`,
        row.adjustments.final === null ? null : gradeScoreLabel(row.adjustments.final),
        row.adjustments.extraPoints === null ? null : gradeScoreLabel(row.adjustments.extraPoints),
        row.adjustments.extraMax,
        totalGrade,
        totalMax,
        percentage === null ? null : percentage.toFixed(1),
        percentage === null ? null : letterGrade(percentage),
        row.adjustments.notes
      ])
    );
  }

  return lines.join("\n");
}
