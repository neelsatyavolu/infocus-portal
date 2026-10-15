"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Play, RotateCcw } from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import {
  commentAuthorLabel,
  formatCommentWhen,
  type StageComment
} from "@/components/package-stages/use-stage-comments";
import { cn } from "@/src/lib/utils";

/**
 * Feedback notes, newest first: author · time on one baseline row, the note, and an optional
 * "Open review" link. Notes in `newIds` (unread when the page opened) get a New tag and a green
 * edge. `foldFrom` hides the rest below xl, where the page is one column (the panel's "Show all").
 * With `onToggleResolved`, each note gets Mark resolved / Reopen; resolved notes carry a Resolved
 * tag and dim.
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
  return (
    <ul className={cn("space-y-4", className)}>
      {comments.map((comment, index) => {
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
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                {commentAuthorLabel(comment.author)}
              </span>
              <span className="text-xs text-muted-foreground">{formatCommentWhen(comment.createdAt)}</span>
              {isNew ? (
                <StatusTag tone="success" size="sm" className="self-center">
                  New
                </StatusTag>
              ) : null}
              {resolved ? (
                <StatusTag size="sm" className="self-center">
                  Resolved
                </StatusTag>
              ) : null}
              {onToggleResolved ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto self-center max-sm:h-10"
                  disabled={resolvingId === comment.id}
                  onClick={() => onToggleResolved(comment.id, !resolved)}
                >
                  {resolvingId === comment.id ? <Spinner /> : resolved ? <RotateCcw aria-hidden /> : <Check aria-hidden />}
                  {resolved ? "Reopen" : "Mark resolved"}
                </Button>
              ) : null}
            </div>
            <p
              className={cn(
                "mt-0.5 whitespace-pre-wrap break-words text-sm",
                resolved ? "text-muted-foreground" : "text-[var(--ink-text)]"
              )}
            >
              {comment.body}
            </p>
            {comment.reviewHref ? (
              <Link
                href={comment.reviewHref as never}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 max-sm:h-10")}
              >
                <Play aria-hidden />
                Open review
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
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
