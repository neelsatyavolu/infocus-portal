import { deadlineClosesAt, finalCutClosesAt } from "@/src/lib/deadlines";
import type { GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { effectiveDeadline } from "@/src/lib/package-extensions";

const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEDULE_STAGES = ["pitching", "proofOfContact", "aRollBRoll", "initialCut", "finalCut"] as const;

type ScheduleStage = (typeof SCHEDULE_STAGES)[number];

export type GroupScheduleInput = {
  dates: Record<ScheduleStage, Date | null | undefined>;
  /** Producer-approved stages (Initial Cut through Stage 3; Final Cut once turned in). */
  done: Record<ScheduleStage, boolean>;
  extensionDays: number;
  now: Date;
};

export type GroupScheduleStatus = {
  label: string;
  tone: GroupTileStatusTone;
  daysBehind: number;
};

/**
 * Groups tile schedule chip: days since the earliest stage deadline (shifted by
 * the group's approved extension) that closed without producer approval.
 * Null when the cycle has no deadlines.
 */
export function groupScheduleStatus(input: GroupScheduleInput): GroupScheduleStatus | null {
  if (SCHEDULE_STAGES.every((stage) => !input.dates[stage])) return null;

  const daysBehind = SCHEDULE_STAGES.reduce((worst, stage) => {
    const deadline = effectiveDeadline(input.dates[stage] ?? null, input.extensionDays);
    if (input.done[stage] || !deadline) return worst;
    const closesAt = stage === "finalCut" ? finalCutClosesAt(deadline) : deadlineClosesAt(deadline);
    const lateMs = input.now.getTime() - closesAt.getTime();
    return lateMs > 0 ? Math.max(worst, Math.ceil(lateMs / DAY_MS)) : worst;
  }, 0);

  return daysBehind > 0
    ? { label: `Behind by ${daysBehind}d`, tone: "danger", daysBehind }
    : { label: "On track", tone: "approved", daysBehind: 0 };
}
