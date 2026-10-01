import { classBoardReviewDates } from "@/src/lib/class-board";
import { deadlineClosesAt, finalCutClosesAt } from "@/src/lib/deadlines";
import type { GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { effectiveDeadline } from "@/src/lib/package-extensions";
import { parseDateKeyUtc } from "@/src/lib/show-assignment";

const DAY_MS = 24 * 60 * 60 * 1000;

const CYCLE_DATE_STAGES = ["pitching", "proofOfContact", "aRollBRoll", "initialCut", "finalCut"] as const;

const SCHEDULE_STAGES = [
  "pitching",
  "proofOfContact",
  "aRollBRoll",
  "initialStage1",
  "initialStage2",
  "initialStage3",
  "finalCut"
] as const;

type CycleDateStage = (typeof CYCLE_DATE_STAGES)[number];
type ScheduleStage = (typeof SCHEDULE_STAGES)[number];

export type GroupScheduleInput = {
  dates: Record<CycleDateStage, Date | null | undefined>;
  /** Producer-approved stages; Final Cut once turned in. */
  done: Record<ScheduleStage, boolean>;
  extensionDays: number;
  now: Date;
};

export type GroupScheduleStatus = {
  label: string;
  tone: GroupTileStatusTone;
  daysBehind: number;
};

/** Initial Cut Stage 1 is the cycle date; Stages 2 and 3 use the Class Board's de facto dates before Final Cut. */
function scheduleDates(dates: GroupScheduleInput["dates"]): Record<ScheduleStage, Date | null> {
  const review = classBoardReviewDates(dates.finalCut ?? null);
  const fromKey = (key: string | null) => (key ? parseDateKeyUtc(key) : null);
  return {
    pitching: dates.pitching ?? null,
    proofOfContact: dates.proofOfContact ?? null,
    aRollBRoll: dates.aRollBRoll ?? null,
    initialStage1: dates.initialCut ?? null,
    initialStage2: fromKey(review.initialCutStage2),
    initialStage3: fromKey(review.initialCutStage3),
    finalCut: dates.finalCut ?? null
  };
}

/**
 * Groups tile schedule chip: days since the earliest stage deadline (shifted by
 * the group's approved extension) that closed without producer approval.
 * Null when the cycle has no deadlines.
 */
export function groupScheduleStatus(input: GroupScheduleInput): GroupScheduleStatus | null {
  if (CYCLE_DATE_STAGES.every((stage) => !input.dates[stage])) return null;

  const dates = scheduleDates(input.dates);
  const daysBehind = SCHEDULE_STAGES.reduce((worst, stage) => {
    const deadline = effectiveDeadline(dates[stage], input.extensionDays);
    if (input.done[stage] || !deadline) return worst;
    const closesAt = stage === "finalCut" ? finalCutClosesAt(deadline) : deadlineClosesAt(deadline);
    const lateMs = input.now.getTime() - closesAt.getTime();
    return lateMs > 0 ? Math.max(worst, Math.ceil(lateMs / DAY_MS)) : worst;
  }, 0);

  return daysBehind > 0
    ? { label: `Behind by ${daysBehind}d`, tone: "danger", daysBehind }
    : { label: "On track", tone: "approved", daysBehind: 0 };
}
