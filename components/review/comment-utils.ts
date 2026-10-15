import type { ApprovalStatusValue, MediaReviewDto, MediaStatusValue } from "@/src/lib/types";
import { DEFAULT_REVIEW_FPS, timeSecondsFromFrameNumber } from "@/src/lib/timecode";

export type ReviewComment = MediaReviewDto["comments"][number];
export type ReviewVersion = MediaReviewDto["versions"][number];

export type CommentThread = {
  root: ReviewComment;
  replies: ReviewComment[];
};

export type CommentFilter = "ALL" | "OPEN" | "RESOLVED";
export type CommentsTab = "TIMELINE" | "GENERAL" | "TRANSCRIPT";

export const COMMENT_FILTERS: CommentFilter[] = ["ALL", "OPEN", "RESOLVED"];

export function isCommentFilter(value: unknown): value is CommentFilter {
  return value === "ALL" || value === "OPEN" || value === "RESOLVED";
}

export function clampToDuration(timeSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(timeSeconds)) {
    return 0;
  }
  if (durationSeconds <= 0) {
    return Math.max(0, timeSeconds);
  }
  return Math.min(Math.max(0, timeSeconds), durationSeconds);
}

export function formatPinLabel(xPct: number | null, yPct: number | null) {
  if (xPct === null || yPct === null || !Number.isFinite(xPct) || !Number.isFinite(yPct)) {
    return "Image comment";
  }
  return `Point ${Math.round(xPct)}%, ${Math.round(yPct)}%`;
}

export function commentSeekTimeSeconds(comment: ReviewComment) {
  if (comment.frameNumber !== null && comment.frameNumber !== undefined) {
    return timeSecondsFromFrameNumber(comment.frameNumber, DEFAULT_REVIEW_FPS);
  }
  return comment.timeSeconds;
}

/** The root and every reply under it (replies of replies too). */
export function collectCommentThreadIds(comments: ReviewComment[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const comment of comments) {
      if (comment.parentCommentId !== null && ids.has(comment.parentCommentId) && !ids.has(comment.id)) {
        ids.add(comment.id);
        added = true;
      }
    }
  }
  return ids;
}

/** Root comments of one version, each with its direct replies oldest first. */
export function buildThreads(versionComments: ReviewComment[]): CommentThread[] {
  return versionComments
    .filter((comment) => comment.parentCommentId === null)
    .map((root) => ({
      root,
      replies: versionComments
        .filter((candidate) => candidate.parentCommentId === root.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }));
}

/** Timecoded (or pinned) threads: by time on a video, oldest first on an image. */
export function timelineThreads(threads: CommentThread[], isImageReview: boolean): CommentThread[] {
  return threads
    .filter((thread) => thread.root.targetType !== "GENERAL")
    .sort((a, b) =>
      isImageReview ? a.root.createdAt.localeCompare(b.root.createdAt) : a.root.timeSeconds - b.root.timeSeconds
    );
}

/** General (not timecoded) threads, oldest first. */
export function generalThreads(threads: CommentThread[]): CommentThread[] {
  return threads
    .filter((thread) => thread.root.targetType === "GENERAL")
    .sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt));
}

export function filterThreads(threads: CommentThread[], filter: CommentFilter) {
  if (filter === "ALL") {
    return threads;
  }
  const wantResolved = filter === "RESOLVED";
  return threads.filter((thread) => (thread.root.resolvedAt !== null) === wantResolved);
}

export function filterCounts(threads: CommentThread[]): Record<CommentFilter, number> {
  const resolved = threads.filter((thread) => thread.root.resolvedAt !== null).length;
  return { ALL: threads.length, OPEN: threads.length - resolved, RESOLVED: resolved };
}

/**
 * Stable thread numbers: the position in the unfiltered, sorted list. Markers, pins and cards all
 * use these, so "#3" means the same comment everywhere whatever the filter.
 */
export function threadNumbers(threads: CommentThread[]) {
  return new Map(threads.map((thread, index) => [thread.root.id, index + 1]));
}

export type NewCommentRule = {
  /** ISO time of the viewer's last visit to this version, or null (nothing counts as new). */
  baseline: string | null;
  /** Comments made on this page this visit (they are all labeled "You"). */
  localIds: ReadonlySet<string>;
  currentUserId: string | null;
};

/** Created since the viewer last looked at this version, by someone else. */
export function isCommentNew(comment: ReviewComment, rule: NewCommentRule) {
  if (!rule.baseline || rule.localIds.has(comment.id)) {
    return false;
  }
  if (rule.currentUserId && comment.authorId === rule.currentUserId) {
    return false;
  }
  return comment.createdAt > rule.baseline;
}

/** Threads whose root or any reply is new. */
export function newThreadIds(threads: CommentThread[], rule: NewCommentRule) {
  const ids = new Set<string>();
  for (const thread of threads) {
    if (isCommentNew(thread.root, rule) || thread.replies.some((reply) => isCommentNew(reply, rule))) {
      ids.add(thread.root.id);
    }
  }
  return ids;
}

/** Count of new comments (roots and replies) in a set of comments. */
export function countNewComments(comments: ReviewComment[], rule: NewCommentRule) {
  return comments.filter((comment) => isCommentNew(comment, rule)).length;
}

const STATUS_WORDS: Record<MediaStatusValue, string> = {
  UPLOADING: "Uploading",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Upload failed"
};

export function mediaStatusWord(status: MediaStatusValue) {
  return STATUS_WORDS[status] ?? status;
}

const APPROVAL_WORDS: Record<ApprovalStatusValue, string> = {
  IN_REVIEW: "In review",
  NEEDS_CHANGES: "Needs changes",
  APPROVED: "Approved",
  AIRED: "Aired"
};

export function approvalStatusWord(status: ApprovalStatusValue) {
  return APPROVAL_WORDS[status] ?? status;
}

/**
 * After a refresh, take the new data but keep the playback URL of the version on screen (the
 * <video> is using it, so swapping it would restart the video). Every other version takes its
 * fresh signed URL: the links expire after 30 minutes.
 */
export function mergeRefreshedVersions(current: ReviewVersion[], next: ReviewVersion[], playingVersionId: string | null) {
  const playing = playingVersionId ? current.find((version) => version.id === playingVersionId) : undefined;
  if (!playing?.playbackUrl) {
    return next;
  }
  return next.map((version) =>
    version.id === playing.id ? { ...version, playbackUrl: playing.playbackUrl, thumbnailUrl: playing.thumbnailUrl } : version
  );
}

/** "Abby Lane v3 comments", safe as a file name. */
export function commentsExportBaseName(title: string, versionNumber: number | undefined) {
  return `${title} v${versionNumber ?? ""} comments`.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function formatAiredLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

/** yyyy-mm-dd (UTC) for the air-date input; today when there is no date yet. */
export function toAiredDateInput(iso: string | null): string {
  const source = iso ? new Date(iso) : new Date();
  if (Number.isNaN(source.getTime())) {
    return "";
  }
  const year = source.getUTCFullYear();
  const month = String(source.getUTCMonth() + 1).padStart(2, "0");
  const day = String(source.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
