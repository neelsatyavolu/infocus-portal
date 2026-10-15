"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { collectCommentThreadIds, type ReviewComment } from "@/components/review/comment-utils";

type CreatedComment = Omit<ReviewComment, "authorName">;

/** A comment made on this page is labeled "You" until the next load. */
function asLocalComment(created: CreatedComment): ReviewComment {
  return {
    id: created.id,
    mediaVersionId: created.mediaVersionId,
    body: created.body,
    authorId: created.authorId,
    authorName: "You",
    timeSeconds: created.timeSeconds,
    frameNumber: created.frameNumber,
    xPct: created.xPct,
    yPct: created.yPct,
    targetType: created.targetType,
    createdAt: created.createdAt,
    resolvedAt: created.resolvedAt,
    parentCommentId: created.parentCommentId
  };
}

function withoutIds<T>(record: Record<string, T>, ids: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([id]) => !ids.has(id)));
}

export type NewCommentInput = {
  mediaVersionId: string;
  targetType: "TIMECODE" | "FRAME_PIN" | "GENERAL";
  timeSeconds?: number;
  frameNumber?: number;
  xPct?: number;
  yPct?: number;
  body: string;
};

export type ReviewCommentsState = ReturnType<typeof useReviewComments>;

const HIGHLIGHT_MS = 1400;

/**
 * Comments on the review page and everything people do with them: create (timeline, pin,
 * general), reply, edit, resolve or reopen, delete a thread, import from CSV. Each call shows its
 * own toast on failure. Also holds which thread is selected, flashing, or waiting to scroll into
 * view, the open reply box, per-thread reply drafts and the open edit.
 */
export function useReviewComments({ initialComments, guestToken }: { initialComments: ReviewComment[]; guestToken?: string }) {
  const [comments, setComments] = useState(initialComments);
  const [localIds, setLocalIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submittingReplyFor, setSubmittingReplyFor] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEditCommentId, setSavingEditCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [resolvingCommentId, setResolvingCommentId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!highlightedCommentId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setHighlightedCommentId((current) => (current === highlightedCommentId ? null : current));
    }, HIGHLIGHT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedCommentId]);

  const rememberLocal = useCallback((ids: string[]) => {
    setLocalIds((current) => new Set([...current, ...ids]));
  }, []);

  /** Takes the server's comments after a refresh (keeps which ones were made on this page). */
  const replaceAll = useCallback((next: ReviewComment[]) => setComments(next), []);

  /** Selects a thread, flashes it, and (optionally) scrolls its card into view. */
  const focusThread = useCallback((rootId: string | null, options?: { scroll?: boolean }) => {
    setSelectedCommentId(rootId);
    if (rootId) {
      setHighlightedCommentId(rootId);
      if (options?.scroll) {
        setPendingScrollId(rootId);
      }
    }
  }, []);

  const createComment = useCallback(
    async (input: NewCommentInput) => {
      try {
        const response = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, guestToken })
        });
        if (!response.ok) {
          throw new Error("Failed");
        }
        const payload = await response.json();
        const created = asLocalComment(payload.data as CreatedComment);
        setComments((current) => [...current, created]);
        rememberLocal([created.id]);
        return created;
      } catch {
        toast.error("Could not send comment.");
        return null;
      }
    },
    [guestToken, rememberLocal]
  );

  const setReplyDraft = useCallback((parentId: string, value: string) => {
    setReplyDrafts((drafts) => ({ ...drafts, [parentId]: value }));
  }, []);

  const toggleReply = useCallback((parentId: string) => {
    setReplyingTo((current) => (current === parentId ? null : parentId));
  }, []);

  const sendReply = useCallback(
    async (parentId: string) => {
      const draft = (replyDrafts[parentId] ?? "").trim();
      if (draft.length === 0) {
        return;
      }
      setSubmittingReplyFor(parentId);
      try {
        const response = await fetch(`/api/comments/${parentId}/replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: draft, guestToken })
        });
        if (!response.ok) {
          throw new Error("Failed");
        }
        const payload = await response.json();
        const created = asLocalComment(payload.data as CreatedComment);
        setComments((current) => [...current, created]);
        rememberLocal([created.id]);
        setReplyDrafts((drafts) => ({ ...drafts, [parentId]: "" }));
        setReplyingTo(null);
      } catch {
        toast.error("Could not send reply.");
      } finally {
        setSubmittingReplyFor(null);
      }
    },
    [guestToken, rememberLocal, replyDrafts]
  );

  const startEdit = useCallback((commentId: string, body: string) => {
    setEditingCommentId(commentId);
    setEditDraft(body);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditDraft("");
  }, []);

  const saveEdit = useCallback(
    async (commentId: string) => {
      const body = editDraft.trim();
      if (guestToken || !body) {
        return;
      }
      setSavingEditCommentId(commentId);
      try {
        const response = await fetch(`/api/comments/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body })
        });
        if (!response.ok) {
          throw new Error("Failed");
        }
        setComments((current) => current.map((comment) => (comment.id === commentId ? { ...comment, body } : comment)));
        setEditingCommentId(null);
        setEditDraft("");
      } catch {
        toast.error("Could not save comment.");
      } finally {
        setSavingEditCommentId(null);
      }
    },
    [editDraft, guestToken]
  );

  /** Resolves or reopens a thread: shows the change at once and puts it back if the save fails. */
  const setResolved = useCallback(
    async (commentId: string, resolved: boolean) => {
      if (guestToken) {
        return;
      }
      const previous = comments.find((comment) => comment.id === commentId)?.resolvedAt ?? null;
      const apply = (resolvedAt: string | null) =>
        setComments((current) => current.map((comment) => (comment.id === commentId ? { ...comment, resolvedAt } : comment)));
      apply(resolved ? new Date().toISOString() : null);
      setResolvingCommentId(commentId);
      try {
        const response = await fetch(`/api/comments/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved })
        });
        if (!response.ok) {
          throw new Error("Failed");
        }
        const payload = await response.json().catch(() => null);
        const saved = payload?.data?.resolvedAt;
        if (saved === null || typeof saved === "string") {
          apply(saved);
        }
      } catch {
        apply(previous);
        toast.error(resolved ? "Could not resolve comment." : "Could not reopen comment.");
      } finally {
        setResolvingCommentId((current) => (current === commentId ? null : current));
      }
    },
    [comments, guestToken]
  );

  /** Deletes a thread (its replies too). Rethrows so the confirm dialog stays open on failure. */
  const deleteThread = useCallback(
    async (rootId: string) => {
      if (guestToken) {
        return;
      }
      setDeletingCommentId(rootId);
      try {
        const response = await fetch(`/api/comments/${rootId}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) {
          throw new Error("Failed");
        }
        const removedIds = collectCommentThreadIds(comments, rootId);
        const clear = (current: string | null) => (current !== null && removedIds.has(current) ? null : current);
        setComments((current) => {
          const removed = collectCommentThreadIds(current, rootId);
          return current.filter((comment) => !removed.has(comment.id));
        });
        setSelectedCommentId(clear);
        setReplyingTo(clear);
        setPendingScrollId(clear);
        setHighlightedCommentId(clear);
        setEditingCommentId(clear);
        setReplyDrafts((drafts) => withoutIds(drafts, removedIds));
      } catch {
        toast.error("Could not delete comment.");
        throw new Error("Could not delete comment.");
      } finally {
        setDeletingCommentId((current) => (current === rootId ? null : current));
      }
    },
    [comments, guestToken]
  );

  const importCsv = useCallback(
    async (mediaVersionId: string, file: File) => {
      setImporting(true);
      try {
        const csvText = await file.text();
        const response = await fetch("/api/comments/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaVersionId, csvText })
        });
        if (!response.ok) {
          throw new Error("Failed");
        }
        const payload = await response.json();
        const imported = ((payload.data.comments ?? []) as CreatedComment[]).map(asLocalComment);
        setComments((current) => [...current, ...imported]);
        rememberLocal(imported.map((comment) => comment.id));
        toast.success(
          `Imported ${payload.data.importedCount} comments${payload.data.skippedCount ? ` (${payload.data.skippedCount} skipped)` : ""}.`
        );
      } catch {
        toast.error("Could not import comments from CSV.");
      } finally {
        setImporting(false);
      }
    },
    [rememberLocal]
  );

  return {
    comments,
    localIds,
    selectedCommentId,
    highlightedCommentId,
    pendingScrollId,
    replyingTo,
    replyDrafts,
    submittingReplyFor,
    editingCommentId,
    editDraft,
    savingEditCommentId,
    deletingCommentId,
    resolvingCommentId,
    importing,
    cardRefs,
    replaceAll,
    setSelectedCommentId,
    setPendingScrollId,
    focusThread,
    createComment,
    setReplyDraft,
    toggleReply,
    closeReply: () => setReplyingTo(null),
    sendReply,
    startEdit,
    setEditDraft,
    cancelEdit,
    saveEdit,
    setResolved,
    deleteThread,
    importCsv
  };
}
