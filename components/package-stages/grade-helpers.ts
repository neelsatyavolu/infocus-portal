import type {
  FinalCutGradeCardData,
  FinalCutMemberGradeData,
  FinalCutScoreInput
} from "@/components/package-cycle/final-cut-grade-card";
import { firstName } from "@/components/package-stages/types";

/** Typed but unsaved scores, per member. */
export type GradeDraft = Record<string, { quality: string; effort: string }>;

export const PART_MAX = 25;

export function formatGradeDay(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatPts(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

export function percentOf(multiplier: number) {
  return Math.round(multiplier * 100);
}

/** The package's turn-in timing as a tag, with the full sentence for its hover text and the late note. */
export function lateStatus(grade: FinalCutGradeCardData) {
  if (!grade.turnedInAt) {
    return { label: "Not submitted", tone: "neutral" as const, detail: "No Final Cut file is on this package yet." };
  }
  if (grade.daysLate <= 0) {
    return {
      label: "On time",
      tone: "approved" as const,
      detail: `Submitted ${formatGradeDay(grade.turnedInAt)}. No late deduction.`
    };
  }
  const percent = Math.round(grade.penaltyMultiplier * 100);
  if (grade.blocksSecondRevision) {
    return {
      label: `Late · ${percent}% off`,
      tone: "danger" as const,
      detail: `${grade.daysLate} days past the ${formatGradeDay(grade.deadlineAt)} deadline. The automatic deduction is 30%, and a second revision cannot repair it. Each member's penalty is below.`
    };
  }
  return {
    label: `Late · ${percent}% off`,
    tone: "warn" as const,
    detail: `${grade.daysLate} day${grade.daysLate === 1 ? "" : "s"} past the ${formatGradeDay(grade.deadlineAt)} deadline. The automatic deduction is ${percent}%. Each member's penalty is below.`
  };
}

export function draftFrom(members: FinalCutMemberGradeData[]): GradeDraft {
  return Object.fromEntries(
    members.map((member) => [
      member.userId,
      {
        quality: member.myQuality == null ? "" : String(member.myQuality),
        effort: member.myEffort == null ? "" : String(member.myEffort)
      }
    ])
  );
}

/** True when any unlocked member's typed scores differ from the saved ones. */
export function draftIsDirty(members: FinalCutMemberGradeData[], draft: GradeDraft) {
  const saved = draftFrom(members);
  return members.some((member) => {
    if (member.locked) return false;
    const typed = draft[member.userId] ?? { quality: "", effort: "" };
    const was = saved[member.userId] ?? { quality: "", effort: "" };
    return typed.quality.trim() !== was.quality || typed.effort.trim() !== was.effort;
  });
}

export function parsePart(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= PART_MAX ? parsed : Number.NaN;
}

/** Quality + effort typed for one member, or null until both parts are valid. */
export function typedTotal(entry: { quality: string; effort: string }) {
  const quality = parsePart(entry.quality);
  const effort = parsePart(entry.effort);
  return quality != null && effort != null && !Number.isNaN(quality) && !Number.isNaN(effort) ? quality + effort : null;
}

/** Filled rows become scores; a half-filled or out-of-range row is an error. */
export function scoresFromDraft(members: FinalCutMemberGradeData[], draft: GradeDraft) {
  const scores: FinalCutScoreInput[] = [];
  for (const member of members) {
    if (member.locked) continue;
    const entry = draft[member.userId];
    const quality = parsePart(entry?.quality ?? "");
    const effort = parsePart(entry?.effort ?? "");
    if (quality === null && effort === null) continue;
    const label = member.name?.trim() || member.email || "a member";
    if (quality === null || effort === null) {
      return { error: `Enter both quality and effort for ${label}.` };
    }
    if (Number.isNaN(quality) || Number.isNaN(effort)) {
      return { error: `Scores for ${label} must be between 0 and ${PART_MAX}.` };
    }
    scores.push({ memberUserId: member.userId, qualityPoints: quality, effortPoints: effort });
  }
  return scores.length === 0 ? { error: "Enter at least one member's scores." } : { scores };
}

/** Average, "Scored 75% or more…", or who the grade is still waiting on (+ the revision cap). */
export function memberGradeSummary(member: FinalCutMemberGradeData) {
  const waitingOn = member.graderScores
    .filter((grader) => grader.required && (grader.quality == null || grader.effort == null))
    .map((grader) => firstName(grader.name));
  const base = member.complete
    ? `Average quality ${formatPts(member.qualityAverage)} + effort ${formatPts(member.effortAverage)} = ${formatPts(member.average)}`
    : member.locked
      ? "Scored 75% or more before this revision."
      : waitingOn.length > 0
        ? `Waiting on ${waitingOn.join(", ")}`
        : `Waiting on ${member.pendingCount} executive producer${member.pendingCount === 1 ? "" : "s"}`;
  return member.revisionCapped ? `${base} · second revision cap ${formatPts(member.afterRevisionCap)}` : base;
}

/** "−20% · 3 days late" / "none, on time" for the automatic option. */
export function automaticPenaltyLabel(member: FinalCutMemberGradeData) {
  const automatic = percentOf(member.automaticPenaltyMultiplier);
  return automatic > 0
    ? `−${automatic}% · ${member.daysLate} day${member.daysLate === 1 ? "" : "s"} late`
    : "none, on time";
}

/** Short trigger text for the penalty picker ("Auto −20%", "Auto · none", "−15%"). */
export function penaltyTriggerLabel(member: FinalCutMemberGradeData) {
  if (member.latePenaltyPercent != null) return `−${member.latePenaltyPercent}%`;
  const automatic = percentOf(member.automaticPenaltyMultiplier);
  return automatic > 0 ? `Auto −${automatic}%` : "Auto · none";
}
