"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { parseClipComment, wrapClipComment } from "@/src/lib/package-clip-comments";
import { parseReviewNotice } from "@/src/lib/package-review-notice";
import { parseApprovalComment, STAGE_FEEDBACK_READ_EVENT } from "@/src/lib/package-stage-comments";
import type { GroupStageSlug } from "@/src/lib/package-stages";

export type StageComment = {
  id: string;
  body: string;
  createdAt: string;
  /** Set when the group or the producer marked the note handled. */
  resolvedAt?: string | null;
  reviewHref?: string | null;
  author: { userId: string; name: string | null; email: string | null };
};

type CommentsResponse = {
  data?: { comments: StageComment[]; unread?: number };
  error?: { message?: string };
};

/** Strips the approval prefix, the clip wrapper and review-notice text; returns the clip id. */
function cleanComment(comment: StageComment) {
  const clip = parseClipComment(parseApprovalComment(comment.body).text);
  const notice = parseReviewNotice(clip.text);
  return {
    comment: { ...comment, body: notice.text, reviewHref: comment.reviewHref ?? null },
    clipId: clip.mediaItemId
  };
}

export function commentAuthorLabel(author: StageComment["author"]) {
  return author.name?.trim() || author.email || "Producer";
}

export function formatCommentWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Which notes are unread, given the server's count for the whole stage. The server counts every
 * stage note newer than the viewer's last read (clip notes included, the viewer's own skipped)
 * and the list is newest first, so for a viewer with no notes of their own the unread ones are
 * the first `unread` of the full list. Returns the unread notes in this thread (the group
 * thread, or one clip's notes) and how many unread notes sit on clips instead.
 */
export function unreadInThread(
  all: Array<{ id: string; clipId: string | null }>,
  unread: number,
  mediaItemId?: string
) {
  const unreadNotes = all.slice(0, Math.max(0, unread));
  const inThread = (clipId: string | null) => (mediaItemId ? clipId === mediaItemId : !clipId);
  return {
    threadIds: unreadNotes.filter((note) => inThread(note.clipId)).map((note) => note.id),
    onClips: mediaItemId ? 0 : unreadNotes.filter((note) => Boolean(note.clipId)).length
  };
}

/**
 * One stage's producer feedback thread (GET/POST /api/package-cycle/comments), newest first.
 * The group thread leaves out clip notes; clip mode (`mediaItemId`) shows only that clip's notes.
 * `load(true)` marks the stage read and tells the shell (STAGE_FEEDBACK_READ_EVENT) so the
 * stage bar's unread count clears.
 */
export function useStageComments({
  rowId,
  stage,
  mediaItemId
}: {
  rowId: string;
  stage: GroupStageSlug;
  mediaItemId?: string;
}) {
  const [comments, setComments] = useState<StageComment[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(
    async (markRead: boolean, options?: { quiet?: boolean }) => {
      if (!options?.quiet) setLoading(true);
      try {
        const query = new URLSearchParams({ rowId, stage });
        if (markRead) query.set("markRead", "1");
        const response = await fetch(`/api/package-cycle/comments?${query}`, { cache: "no-store" });
        const body = (await response.json()) as CommentsResponse;
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Failed to load feedback.");
        }
        const cleaned = body.data.comments.map(cleanComment);
        const next = cleaned
          .filter(({ clipId }) => (mediaItemId ? clipId === mediaItemId : !clipId))
          .map(({ comment }) => comment);
        const unreadCount = markRead ? 0 : (body.data.unread ?? 0);
        setComments(next);
        setUnread(unreadCount);
        if (markRead) {
          window.dispatchEvent(new Event(STAGE_FEEDBACK_READ_EVENT));
        }
        const split = unreadInThread(
          cleaned.map(({ comment, clipId }) => ({ id: comment.id, clipId })),
          unreadCount,
          mediaItemId
        );
        return { unread: unreadCount, comments: next, ...split };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load feedback.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [rowId, stage, mediaItemId]
  );

  /** Posts a note; returns true when it saved (the caller clears its draft). */
  async function post(text: string) {
    const body = text.trim();
    if (!body || saving) return false;
    setSaving(true);
    try {
      const response = await fetch("/api/package-cycle/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, stage, body: mediaItemId ? wrapClipComment(mediaItemId, body) : body })
      });
      const payload = (await response.json()) as { data?: { comment: StageComment }; error?: { message?: string } };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not post feedback.");
      }
      const saved = cleanComment(payload.data.comment).comment;
      setComments((current) => [saved, ...current]);
      toast.success(stage === "a-roll" ? "Requested changes. Students were emailed." : "Feedback posted.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post feedback.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Marks a note resolved or open again (PATCH), showing the change at once and undoing it on failure. */
  async function setResolved(id: string, resolved: boolean) {
    if (resolvingId) return;
    const previous = comments.find((comment) => comment.id === id)?.resolvedAt ?? null;
    const apply = (resolvedAt: string | null) =>
      setComments((current) => current.map((comment) => (comment.id === id ? { ...comment, resolvedAt } : comment)));
    setResolvingId(id);
    apply(resolved ? new Date().toISOString() : null);
    try {
      const response = await fetch("/api/package-cycle/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolved })
      });
      const payload = (await response.json()) as {
        data?: { comment: { resolvedAt: string | null } };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not update the note.");
      }
      apply(payload.data.comment.resolvedAt);
    } catch (error) {
      apply(previous);
      toast.error(error instanceof Error ? error.message : "Could not update the note.");
    } finally {
      setResolvingId(null);
    }
  }

  return { comments, unread, loading, saving, resolvingId, load, post, setResolved };
}
