import { StatusTag } from "@/components/kit/status-tag";
import { toneFromStatusClass } from "@/components/kit/tone";
import {
  CYCLE_STAGE_STATUS_CLASS,
  CYCLE_STAGE_STATUS_LABELS,
  type CycleStageStatus
} from "@/src/lib/package-stage-status";

/** A package stage's status as a tag (APPROVED, REVISIONS, STAGE 2…). Status is never button-sized. */
export function StageStatusChip({ status, label }: { status: CycleStageStatus; label?: string }) {
  return (
    <StatusTag
      tone={toneFromStatusClass(CYCLE_STAGE_STATUS_CLASS[status])}
      dot={status === "approved" || status === "queued"}
    >
      {label ?? CYCLE_STAGE_STATUS_LABELS[status]}
    </StatusTag>
  );
}
