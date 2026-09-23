export type ApprovalStatus = "IN_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "AIRED";

const transitions: Record<ApprovalStatus, ApprovalStatus[]> = {
  IN_REVIEW: ["NEEDS_CHANGES", "APPROVED"],
  NEEDS_CHANGES: ["IN_REVIEW", "APPROVED"],
  APPROVED: ["NEEDS_CHANGES", "AIRED"],
  AIRED: ["NEEDS_CHANGES"]
};

export function isApprovalTransitionAllowed(from: ApprovalStatus, to: ApprovalStatus) {
  if (from === to) {
    return true;
  }

  return transitions[from].includes(to);
}
