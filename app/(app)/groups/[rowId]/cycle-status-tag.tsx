import { StatusTag } from "@/components/kit/status-tag";
import { toneFromStatusClass } from "@/components/kit/tone";
import {
  CYCLE_STAGE_STATUS_CLASS,
  CYCLE_STAGE_STATUS_LABELS,
  type CycleStageStatus
} from "@/src/lib/package-stage-status";

/**
 * A cycle stage status (APPROVED, SUBMITTED, REVISIONS, STAGE 2, QUEUED…) as a kit StatusTag:
 * the same words and tones as StageStatusChip, so the stage bar, the section header and the
 * hosted stage header never disagree.
 */
export function CycleStatusTag({
  status,
  size = "md",
  className
}: {
  status: CycleStageStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <StatusTag
      tone={toneFromStatusClass(CYCLE_STAGE_STATUS_CLASS[status])}
      size={size}
      dot={status === "approved" || status === "queued"}
      className={className}
    >
      {CYCLE_STAGE_STATUS_LABELS[status]}
    </StatusTag>
  );
}
