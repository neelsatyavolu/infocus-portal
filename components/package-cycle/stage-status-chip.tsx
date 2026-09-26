import {
  CYCLE_STAGE_STATUS_CLASS,
  CYCLE_STAGE_STATUS_LABELS,
  type CycleStageStatus
} from "@/src/lib/package-stage-status";
import { cn } from "@/src/lib/utils";

export function StageStatusChip({
  status,
  size = "md",
  label
}: {
  status: CycleStageStatus;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const showDot = status === "approved" || status === "queued";
  return (
    <span
      className={cn(
        "status-pill",
        size === "sm" && "status-pill-sm",
        size === "lg" && "status-pill-lg",
        CYCLE_STAGE_STATUS_CLASS[status]
      )}
    >
      {showDot ? (
        <span
          className={cn("shrink-0 rounded-full bg-current", size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5")}
        />
      ) : null}
      {label ?? CYCLE_STAGE_STATUS_LABELS[status]}
    </span>
  );
}
