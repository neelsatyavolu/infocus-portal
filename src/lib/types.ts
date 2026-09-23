export type MemberRole = "OWNER_ADMIN" | "EDITOR" | "REVIEWER";
export type MediaStatusValue = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
export type MediaSourceTypeValue = "VIDEO" | "IMAGE";
export type ApprovalStatusValue = "IN_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "AIRED";
export type CommentTargetTypeValue = "TIMECODE" | "FRAME_PIN" | "GENERAL";
export type GuestPermissionValue = "VIEW" | "COMMENT";

export type ReviewCommentDto = {
  id: string;
  mediaVersionId: string;
  body: string;
  authorId: string | null;
  authorName: string;
  timeSeconds: number;
  frameNumber: number | null;
  xPct: number | null;
  yPct: number | null;
  targetType: CommentTargetTypeValue;
  createdAt: string;
  resolvedAt: string | null;
  parentCommentId: string | null;
};

export type MediaVersionDto = {
  id: string;
  versionNumber: number;
  bunnyVideoId: string;
  sourceType: MediaSourceTypeValue;
  status: MediaStatusValue;
  approvalStatus: ApprovalStatusValue;
  approvedInStage?: 1 | 2 | 3 | null;
  airedAt: string | null;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
};

export type MediaReviewDto = {
  mediaId: string;
  projectId: string;
  projectName: string;
  folderName: string | null;
  title: string;
  workspaceRole: MemberRole;
  canUpdateApprovalStatus: boolean;
  canManageQuickGrades: boolean;
  currentUserId: string | null;
  packageReview?: {
    rowId: string;
    kind: "initial-cut";
    stage: string;
    canSubmitReview: boolean;
    canApprove: boolean;
    canUnapprove?: boolean;
    canApproveAnyway?: boolean;
    awaitingRevisedInitialCut?: boolean;
    remainingExecutiveSignoffs?: number;
  } | null;
  assignedPeople: Array<{
    userId: string;
    name: string | null;
    email: string | null;
  }>;
  versions: MediaVersionDto[];
  currentVersionId: string;
  comments: ReviewCommentDto[];
};

export type GuestLinkDto = {
  id: string;
  token: string;
  permission: GuestPermissionValue;
  expiresAt: string | null;
  revokedAt: string | null;
};
