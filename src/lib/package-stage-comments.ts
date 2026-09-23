import { GROUP_STAGE_SLUGS, type GroupStageSlug } from "@/src/lib/package-stages";

export const STAGE_FEEDBACK_READ_EVENT = "infocus-stage-feedback-read";

export const STUDENT_FEEDBACK_STAGES = [
  "brainstorming",
  "a-roll",
  "initial-cut",
  "final-cut"
] as const satisfies readonly GroupStageSlug[];

export type StudentFeedbackStage = (typeof STUDENT_FEEDBACK_STAGES)[number];

export type StageCommentUnread = Record<StudentFeedbackStage, number>;

export const EMPTY_STAGE_COMMENT_UNREAD: StageCommentUnread = {
  brainstorming: 0,
  "a-roll": 0,
  "initial-cut": 0,
  "final-cut": 0
};

export const APPROVAL_COMMENT_PREFIX = "[[approved]]";
const APPROVAL_MARK = /^\[\[approved\]\]\n?/;

export function wrapApprovalComment(body: string) {
  return `${APPROVAL_COMMENT_PREFIX}\n${body}`;
}

export function parseApprovalComment(body: string): { fromApproval: boolean; text: string } {
  const match = (body || "").match(APPROVAL_MARK);
  if (!match) {
    return { fromApproval: false, text: body };
  }
  return { fromApproval: true, text: body.slice(match[0].length) };
}

export function isApprovalComment(body: string) {
  return parseApprovalComment(body).fromApproval;
}

export function isFeedbackStage(value: string): value is GroupStageSlug {
  return (GROUP_STAGE_SLUGS as readonly string[]).includes(value);
}

export function emptyStageCommentUnread(): StageCommentUnread {
  return { ...EMPTY_STAGE_COMMENT_UNREAD };
}

export function countUnreadComments(
  comments: Array<{ stage: string; createdAt: Date; authorId: string; rowId: string }>,
  reads: Array<{ stage: string; lastReadAt: Date; rowId: string }>,
  viewerUserId: string
): StageCommentUnread {
  const unread = emptyStageCommentUnread();
  const lastRead = new Map<string, Date>();
  for (const read of reads) {
    lastRead.set(`${read.rowId}:${read.stage}`, read.lastReadAt);
  }

  for (const comment of comments) {
    if (comment.authorId === viewerUserId) continue;
    if (!STUDENT_FEEDBACK_STAGES.includes(comment.stage as StudentFeedbackStage)) continue;
    const seenAt = lastRead.get(`${comment.rowId}:${comment.stage}`);
    if (seenAt && comment.createdAt <= seenAt) continue;
    unread[comment.stage as StudentFeedbackStage] += 1;
  }

  return unread;
}

export function unreadCountForStage(
  comments: Array<{ stage: string; createdAt: Date; authorId: string; rowId: string }>,
  reads: Array<{ stage: string; lastReadAt: Date; rowId: string }>,
  viewerUserId: string,
  stage: string
) {
  if (!STUDENT_FEEDBACK_STAGES.includes(stage as StudentFeedbackStage)) {
    return 0;
  }
  return countUnreadComments(comments, reads, viewerUserId)[stage as StudentFeedbackStage];
}
