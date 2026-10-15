import { StatusTag } from "@/components/kit/status-tag";
import type { StatusTone } from "@/components/kit/tone";
import { approvalTagLabel, uploadStatusLabel, type DateZone } from "@/components/project-assets/format";
import type { ApprovalStatusValue, MediaTileVersion, ThumbStatus } from "@/components/project-assets/types";

const APPROVAL_TONE: Record<ApprovalStatusValue, StatusTone> = {
  IN_REVIEW: "warning",
  NEEDS_CHANGES: "danger",
  APPROVED: "success",
  AIRED: "neutral"
};

/**
 * In review (amber) · Needs changes (danger) · Approved (green) · Aired · date (neutral). Pass
 * `zone` from useDateZone() so the air date renders the same on the server and in hydration.
 */
export function ApprovalTag({
  version,
  zone,
  size = "md"
}: {
  version: Pick<MediaTileVersion, "approvalStatus" | "airedAt">;
  zone: DateZone;
  size?: "sm" | "md";
}) {
  return (
    <StatusTag tone={APPROVAL_TONE[version.approvalStatus]} size={size} srLabel="Approval: ">
      {approvalTagLabel(version, zone)}
    </StatusTag>
  );
}

/** Uploading / Processing (neutral, dot) or Failed (danger) while a version isn't ready. */
export function MediaStatusTag({ status, size = "md" }: { status: ThumbStatus; size?: "sm" | "md" }) {
  if (status === "READY") {
    return null;
  }
  const failed = status === "FAILED";
  return (
    <StatusTag tone={failed ? "danger" : "neutral"} dot={!failed} size={size}>
      {uploadStatusLabel(status)}
    </StatusTag>
  );
}
