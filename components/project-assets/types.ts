/** Shapes shared by the project assets screen (/projects/<id>). */

export type ApprovalStatusValue = "IN_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "AIRED";
export type MediaStatusValue = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
export type ViewMode = "grid" | "list";
export type ScopeMode = "active" | "deleted";
export type GuestPermissionValue = "VIEW" | "COMMENT";
export type FilterValue = "all" | "ready" | "in-progress" | "failed";
export type SortValue = "recent" | "name" | "status";

export type FolderItem = {
  id: string;
  name: string;
  itemCount: number;
};

export type MediaTileVersion = {
  id: string;
  versionNumber: number;
  sourceType: "VIDEO" | "IMAGE";
  status: MediaStatusValue;
  approvalStatus: ApprovalStatusValue;
  airedAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  createdByName: string;
  commentCount: number;
};

export type AssignedMember = {
  userId: string;
  name: string | null;
  email: string | null;
};

export type MediaTileItem = {
  id: string;
  title: string;
  reviewHref: string;
  currentVersionId: string | null;
  folderId: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  assignedMembers: AssignedMember[];
  versions: MediaTileVersion[];
};

export type WorkspaceMemberOption = AssignedMember;

export type ShareLink = {
  id: string;
  token: string;
  permission: GuestPermissionValue;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type UploadAction = { kind: "new" } | { kind: "version"; mediaId: string } | null;

export type ConfirmAction =
  | { type: "soft-delete" | "permanent-delete"; mediaIds: string[]; label: string }
  | { type: "permission-denied"; label: string }
  | null;

export type DownloadConfirmAction = {
  mediaId: string;
  versionId: string;
  title: string;
  versionNumber: number;
} | null;

export type RenameAction = { mediaId: string } | null;

export type MoveToVersionAction = {
  sourceMediaId: string;
  targetMediaId: string;
} | null;

export type ActiveUploadStatus = "PREPARING" | "UPLOADING" | "PROCESSING";

export type ActiveUpload = {
  id: string;
  fileName: string;
  mediaId: string | null;
  status: ActiveUploadStatus;
  progress: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
  updatedAt: number;
};

/** What the thumbnail shows instead of the picture while a version isn't ready. */
export type ThumbStatus = ActiveUploadStatus | MediaStatusValue;

export type DragPreviewState = {
  title: string;
  thumbnailUrl: string | null;
  itemCount: number;
};

/** One error or hint above the content (errors raised while a dialog is open show in that dialog). */
export type PageNotice = { tone: "danger" | "warning"; message: string } | null;
