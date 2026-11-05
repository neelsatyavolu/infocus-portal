"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, Play, RotateCcw } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { isReviewNoticeText } from "@/src/lib/package-review-notice";
import {
  commentAuthorLabel,
  formatCommentWhen,
  type StageComment
} from "@/components/package-stages/use-stage-comments";
import { cn } from "@/src/lib/utils";

function ReviewLink({ href }: { href: string }) {
  return (
    <Link
      href={href as never}
      className="inline-flex items-center gap-1 rounded-sm font-medium text-[var(--brand-green)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Play className="h-3.5 w-3.5" aria-hidden />
      Open review
    </Link>
  );
}

/** "Abby submitted a review…" notes: automatic, each pointing at a review on the video page. */
export function isReviewNotice(comment: StageComment) {
  return Boolean(comment.reviewHref) && isReviewNoticeText(comment.body);
}

/**
 * Feedback notes, newest first: author, time and tags on one row with a small resolve button,
 * then the note (and an inline Open review link when it points at one). Notes in `newIds`
 * (unread when the page opened) get a New tag and a green edge. `foldFrom` hides the rest below
 * xl, where the page is one column (the panel's "Show all"). With `onToggleResolved`, each note
 * gets Mark resolved / Reopen; resolved notes carry a Resolved tag and dim.
 * Automatic review notices don't crowd the notes: they fold into a closed "Review activity (n)"
 * line underneath, one line each with its Open review link.
 */
export function FeedbackNotes({
  comments,
  newIds,
  foldFrom,
  onToggleResolved,
  resolvingId,
  className
}: {
  comments: StageComment[];
  newIds?: ReadonlySet<string>;
  foldFrom?: number;
  onToggleResolved?: (id: string, resolved: boolean) => void;
  resolvingId?: string | null;
  className?: string;
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const notes = comments.filter((comment) => !isReviewNotice(comment));
  const notices = comments.filter(isReviewNotice);
  const newNotices = notices.filter((comment) => newIds?.has(comment.id)).length;

  return (
    <div className={cn("space-y-3.5", className)}>
      {notes.length > 0 ? (
        <ul className="space-y-3.5">
          {notes.map((comment, index) => {
            const isNew = Boolean(newIds?.has(comment.id));
            const resolved = Boolean(comment.resolvedAt);
            return (
              <li
                key={comment.id}
                className={cn(
                  "min-w-0 border-l-2 pl-3",
                  isNew ? "border-l-[var(--brand-green)]" : "border-l-border",
                  foldFrom !== undefined && index >= foldFrom && "max-xl:hidden"
                )}
              >
                <div className="flex min-h-8 min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                    {commentAuthorLabel(comment.author)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatCommentWhen(comment.createdAt)}</span>
                  {isNew ? (
                    <StatusTag tone="success" size="sm" className="shrink-0">
                      New
                    </StatusTag>
                  ) : null}
                  {resolved ? (
                    <StatusTag size="sm" className="shrink-0">
                      Resolved
                    </StatusTag>
                  ) : null}
                  {onToggleResolved ? (
                    <IconButton
                      label={resolved ? "Reopen" : "Mark resolved"}
                      icon={resolved ? RotateCcw : Check}
                      size="sm"
                      pressed={resolved}
                      busy={resolvingId === comment.id}
                      disabled={resolvingId === comment.id}
                      className="-my-1 ml-auto shrink-0"
                      onClick={() => onToggleResolved(comment.id, !resolved)}
                    />
                  ) : null}
                </div>
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words text-sm",
                    resolved ? "text-muted-foreground" : "text-[var(--ink-text)]"
                  )}
                >
                  {comment.body}
                </p>
                {comment.reviewHref ? (
                  <p className="mt-1 text-sm">
                    <ReviewLink href={comment.reviewHref} />
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {notices.length > 0 ? (
        <div className="min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 max-sm:h-10"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((open) => !open)}
          >
            <ChevronDown aria-hidden className={cn("transition-transform", activityOpen && "rotate-180")} />
            {`Review activity (${notices.length})`}
            {newNotices > 0 ? (
              <StatusTag tone="success" size="sm">
                {`${newNotices} new`}
              </StatusTag>
            ) : null}
          </Button>
          {activityOpen ? (
            <ul className="mt-1 divide-y divide-border">
              {notices.map((comment) => (
                <li key={comment.id} className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">{commentAuthorLabel(comment.author)}</span>
                  <span className="text-muted-foreground">submitted a review</span>
                  <span className="text-xs text-muted-foreground">{formatCommentWhen(comment.createdAt)}</span>
                  {newIds?.has(comment.id) ? (
                    <StatusTag tone="success" size="sm">
                      New
                    </StatusTag>
                  ) : null}
                  <span className="ml-auto">{comment.reviewHref ? <ReviewLink href={comment.reviewHref} /> : null}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The note box under a feedback thread: a visible label (which names the field) with an optional
 * helper line, the shared Textarea, Cmd/Ctrl+Enter to post, and one h-9 submit button.
 */
export function FeedbackComposer({
  label,
  hint,
  placeholder,
  saving,
  submitLabel = "Post feedback",
  submitVariant = "outline",
  onSubmit
}: {
  label: ReactNode;
  hint?: ReactNode;
  placeholder: string;
  saving: boolean;
  /** "Request changes" on A-roll, where posting asks the group for changes. */
  submitLabel?: string;
  submitVariant?: "outline" | "default";
  /** Resolves true when the note saved, which clears the box. */
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const hintId = `${id}-hint`;

  async function submit() {
    if (saving || !draft.trim()) return;
    if (await onSubmit(draft)) setDraft("");
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div>
        <label
          htmlFor={id}
          className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground"
        >
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <Textarea
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (!isSubmitShortcut(event)) return;
          event.preventDefault();
          if (!saving && draft.trim()) event.currentTarget.form?.requestSubmit();
        }}
        rows={3}
        maxLength={2000}
        aria-describedby={hint ? hintId : undefined}
        placeholder={placeholder}
        className="resize-y"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={submitVariant} disabled={saving || !draft.trim()} className="max-sm:h-10">
          {saving ? <Spinner /> : null}
          {submitLabel}
        </Button>
        <SubmitShortcutHint />
      </div>
    </form>
  );
}
