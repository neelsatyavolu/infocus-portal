"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Check, MessageCircleReply, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Avatar } from "@/components/kit/avatar";
import { IconButton } from "@/components/kit/icon-button";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { RelativeAge } from "@/components/relative-age";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AutoGrowTextarea } from "@/components/review/auto-grow-textarea";
import { formatPinLabel, type CommentThread, type ReviewComment } from "@/components/review/comment-utils";
import type { ReviewCommentsState } from "@/components/review/use-review-comments";
import { isCoarsePointer, shouldEnterSend } from "@/src/lib/enter-to-send";
import { DEFAULT_REVIEW_FPS, formatFrameAccurateTimecode } from "@/src/lib/timecode";
import { cn } from "@/src/lib/utils";

/**
 * A marker tap scrolls its comment into the gap between the pinned player (under the app's top
 * bar: a flush 16:9 picture plus about 106px of markers, seek and controls) and the docked composer.
 */
const CARD_SCROLL_MARGIN_CLASS =
  "max-lg:portrait:scroll-mt-[calc(56.25vw_+_7rem_+_var(--app-header-h,0px))] max-lg:portrait:scroll-mb-44";
/** Card actions: shown on hover, focus or selection with a mouse; always shown on touch. */
const REVEAL_CLASS =
  "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/thread:opacity-100 pointer-fine:group-focus-within/thread:opacity-100";
const ROW_ICON_CLASS = "pointer-coarse:h-10";
const REPLY_MAX_HEIGHT_PX = 4 * 20 + 18;

export type ThreadPermissions = {
  currentUserId: string | null;
  canReply: boolean;
  /** Edit your own timeline comments (signed in, while commenting is open). */
  canEditOwn: boolean;
  /** Edit your own replies on the timeline (signed in; stays on after commenting closes). */
  canEditOwnReplies: boolean;
  canDelete: boolean;
  /** Resolve or reopen anyone's timeline comment (editors and up, while commenting is open). */
  canResolveAny: boolean;
  /** Resolve or reopen your own timeline comment (reviewers too). */
  canResolveOwn: boolean;
};

function stop(event: MouseEvent) {
  event.stopPropagation();
}

function InlineEditor({
  state,
  commentId,
  compact = false
}: {
  state: ReviewCommentsState;
  commentId: string;
  compact?: boolean;
}) {
  const saving = state.savingEditCommentId === commentId;
  return (
    <div className="mt-1 space-y-2" onClick={stop}>
      <Textarea
        value={state.editDraft}
        onChange={(event) => state.setEditDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            state.cancelEdit();
          }
        }}
        aria-label="Edit comment"
        className={compact ? "min-h-[50px]" : "min-h-[60px]"}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void state.saveEdit(commentId)}
          disabled={saving || !state.editDraft.trim()}
        >
          {saving ? <Spinner /> : null}
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={state.cancelEdit} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Replies({
  replies,
  state,
  permissions,
  editable
}: {
  replies: ReviewComment[];
  state: ReviewCommentsState;
  permissions: ThreadPermissions;
  /** Timeline threads only; General replies are read-only. */
  editable: boolean;
}) {
  if (replies.length === 0) {
    return null;
  }
  return (
    <ul className="mt-2 ml-8 space-y-2 border-l border-border pl-3">
      {replies.map((reply) => {
        const own = Boolean(permissions.currentUserId && reply.authorId === permissions.currentUserId);
        const editing = state.editingCommentId === reply.id;
        return (
          <li key={reply.id} className="group/reply min-w-0">
            <div className="flex min-h-8 min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{reply.authorName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <RelativeAge iso={reply.createdAt} />
              </span>
              <span className="flex-1" />
              {editable && own && permissions.canEditOwnReplies && !editing ? (
                <IconButton
                  label="Edit reply"
                  icon={Pencil}
                  size="sm"
                  className={cn(
                    ROW_ICON_CLASS,
                    "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/reply:opacity-100 pointer-fine:focus-visible:opacity-100"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    state.startEdit(reply.id, reply.body);
                  }}
                />
              ) : null}
            </div>
            {editing ? (
              <InlineEditor state={state} commentId={reply.id} compact />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--ink-text)]">{reply.body}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ReplyComposer({ thread, state }: { thread: CommentThread; state: ReviewCommentsState }) {
  const id = thread.root.id;
  const draft = state.replyDrafts[id] ?? "";
  const sending = state.submittingReplyFor === id;
  const send = () => {
    if (!sending && draft.trim()) {
      void state.sendReply(id);
    }
  };
  return (
    <div className="mt-2 ml-8 flex items-end gap-2" onClick={stop}>
      <AutoGrowTextarea
        value={draft}
        onChange={(event) => state.setReplyDraft(id, event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Escape") {
            event.preventDefault();
            state.closeReply();
            return;
          }
          if (shouldEnterSend({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }, isCoarsePointer())) {
            event.preventDefault();
            send();
          }
        }}
        rows={1}
        maxHeightPx={REPLY_MAX_HEIGHT_PX}
        placeholder="Write a reply"
        aria-label={`Reply to ${thread.root.authorName}`}
        className="min-h-9 resize-none py-1.5"
        autoFocus
      />
      <Button type="button" variant="secondary" className="h-9 shrink-0" onClick={send} disabled={sending || !draft.trim()}>
        {sending ? <Spinner /> : null}
        Send
      </Button>
    </div>
  );
}

/**
 * One comment thread. Line 1: avatar, author, age, then New / Resolved tags and the stable #n.
 * Then the note, its replies, and (timeline only) a footer that never changes height: the time
 * or pin (jumps there) and Reply on the left, Resolve or Reopen / Edit / Delete on the right, all
 * one height.
 */
export function CommentThreadCard({
  thread,
  number,
  kind,
  isImageReview,
  isSelected,
  isHighlighted,
  isNew,
  state,
  permissions,
  onFocus,
  onRequestDelete
}: {
  thread: CommentThread;
  number: number;
  kind: "timeline" | "general";
  isImageReview: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isNew: boolean;
  state: ReviewCommentsState;
  permissions: ThreadPermissions;
  onFocus?: (thread: CommentThread) => void;
  onRequestDelete?: (thread: CommentThread) => void;
}) {
  const { root } = thread;
  const timeline = kind === "timeline";
  const resolved = root.resolvedAt !== null;
  const own = Boolean(permissions.currentUserId && root.authorId === permissions.currentUserId);
  const editing = state.editingCommentId === root.id;
  const canEdit = timeline && own && permissions.canEditOwn && !editing;
  const canDelete = timeline && permissions.canDelete;
  const canReply = timeline && permissions.canReply;
  const canResolve = timeline && (own ? permissions.canResolveOwn : permissions.canResolveAny);
  const timeLabel = isImageReview
    ? formatPinLabel(root.xPct, root.yPct)
    : formatFrameAccurateTimecode(root.timeSeconds, root.frameNumber, DEFAULT_REVIEW_FPS);

  return (
    <article
      ref={(node) => {
        state.cardRefs.current[root.id] = node;
      }}
      onClick={timeline && onFocus ? () => onFocus(thread) : undefined}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "group/thread relative min-w-0 rounded-md border p-3 transition-colors",
        timeline && cn("cursor-pointer", CARD_SCROLL_MARGIN_CLASS),
        isSelected
          ? "border-[var(--brand-green)]/50 bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-md before:bg-[var(--brand-green)]"
          : isHighlighted
            ? "border-[var(--brand-green)] bg-[var(--ink-2)]"
            : cn("border-border bg-[var(--ink-2)]", timeline && "hover:bg-[var(--ink-3)]")
      )}
    >
      <div className="flex h-6 min-w-0 items-center gap-2">
        <span aria-hidden className="flex">
          <Avatar name={root.authorName} size={24} title="" />
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{root.authorName}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          <RelativeAge iso={root.createdAt} />
        </span>
        <span className="min-w-2 flex-1" />
        {isNew ? (
          <StatusTag size="sm" tone="success">
            New
          </StatusTag>
        ) : null}
        {resolved ? (
          <StatusTag size="sm" tone="muted" icon={Check}>
            Resolved
          </StatusTag>
        ) : null}
        <span className="shrink-0 font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">#{number}</span>
      </div>

      <div className="pl-8">
        {editing ? (
          <InlineEditor state={state} commentId={root.id} />
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{root.body}</p>
        )}
      </div>

      <Replies replies={thread.replies} state={state} permissions={permissions} editable={timeline} />

      {timeline && state.replyingTo === root.id && canReply ? <ReplyComposer thread={thread} state={state} /> : null}

      {timeline ? (
        <div className="mt-2 flex min-h-8 items-center gap-1 pl-6 pointer-coarse:min-h-10">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onFocus?.(thread);
            }}
            title={isImageReview ? "Show this pin" : "Jump to this moment"}
            className="h-8 shrink-0 px-2 font-mono-broadcast text-xs font-medium tabular-nums text-[var(--brand-green)] hover:text-[var(--brand-green)] pointer-coarse:h-10"
          >
            {timeLabel}
          </Button>
          {canReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground pointer-coarse:h-10"
              aria-expanded={state.replyingTo === root.id}
              onClick={(event) => {
                event.stopPropagation();
                state.toggleReply(root.id);
              }}
            >
              <MessageCircleReply aria-hidden />
              Reply
            </Button>
          ) : null}
          <span className="flex-1" />
          <div className={cn("flex items-center gap-0.5", REVEAL_CLASS, isSelected && "pointer-fine:opacity-100")}>
            {canResolve ? (
              <IconButton
                label={resolved ? "Reopen comment" : "Resolve comment"}
                icon={resolved ? RotateCcw : Check}
                size="sm"
                busy={state.resolvingCommentId === root.id}
                className={ROW_ICON_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  void state.setResolved(root.id, !resolved);
                }}
              />
            ) : null}
            {canEdit ? (
              <IconButton
                label="Edit comment"
                icon={Pencil}
                size="sm"
                className={ROW_ICON_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  state.startEdit(root.id, root.body);
                }}
              />
            ) : null}
            {canDelete ? (
              <IconButton
                label="Delete comment"
                icon={Trash2}
                size="sm"
                tone="danger"
                disabled={state.deletingCommentId === root.id}
                className={ROW_ICON_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestDelete?.(thread);
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
