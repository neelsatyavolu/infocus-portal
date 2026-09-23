"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquare, Play } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseClipComment, wrapClipComment } from "@/src/lib/package-clip-comments";
import { parseReviewNotice } from "@/src/lib/package-review-notice";
import { parseApprovalComment, STAGE_FEEDBACK_READ_EVENT } from "@/src/lib/package-stage-comments";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";

type StageComment = {
  id: string;
  body: string;
  createdAt: string;
  reviewHref?: string | null;
  author: { userId: string; name: string | null; email: string | null };
};

function authorLabel(author: StageComment["author"]) {
  return author.name?.trim() || author.email || "Producer";
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function StageComments({
  rowId,
  stage,
  canWrite,
  mediaItemId,
  className,
  onPosted
}: {
  rowId: string;
  stage: GroupStageSlug;
  canWrite: boolean;
  mediaItemId?: string;
  className?: string;
  onPosted?: () => void;
}) {
  const [comments, setComments] = useState<StageComment[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(
    async (markRead: boolean) => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ rowId, stage });
        if (markRead) query.set("markRead", "1");
        const response = await fetch(`/api/package-cycle/comments?${query}`, { cache: "no-store" });
        const body = (await response.json()) as {
          data?: { comments: StageComment[]; unread?: number };
          error?: { message?: string };
        };
        if (!response.ok || !body.data) {
          throw new Error(body.error?.message ?? "Failed to load feedback.");
        }
        const next = body.data.comments
          .map((comment) => {
            const clip = parseClipComment(parseApprovalComment(comment.body).text);
            const notice = parseReviewNotice(clip.text);
            return {
              ...comment,
              body: notice.text,
              clipId: clip.mediaItemId,
              reviewHref: comment.reviewHref ?? null
            };
          })
          .filter((comment) => (mediaItemId ? comment.clipId === mediaItemId : !comment.clipId));
        setComments(next);
        setUnread(markRead ? 0 : (body.data.unread ?? 0));
        if (markRead) {
          window.dispatchEvent(new Event(STAGE_FEEDBACK_READ_EVENT));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load feedback.");
      } finally {
        setLoading(false);
      }
    },
    [rowId, stage, mediaItemId]
  );

  useEffect(() => {
    void load(Boolean(mediaItemId));
  }, [load, mediaItemId]);

  async function submit() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/package-cycle/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId,
          stage,
          body: mediaItemId ? wrapClipComment(mediaItemId, body) : body
        })
      });
      const payload = (await response.json()) as {
        data?: { comment: StageComment };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not post feedback.");
      }
      const saved = payload.data.comment;
      const clip = parseClipComment(parseApprovalComment(saved.body).text);
      const notice = parseReviewNotice(clip.text);
      setComments((current) => [
        { ...saved, body: notice.text, reviewHref: saved.reviewHref ?? null },
        ...current
      ]);
      setDraft("");
      toast.success(stage === "a-roll" ? "Requested changes. Students were emailed." : "Feedback posted.");
      onPosted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post feedback.");
    } finally {
      setSaving(false);
    }
  }

  const thread = (
    <>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading feedback…
        </p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canWrite
            ? mediaItemId
              ? "No notes on this clip yet."
              : "No feedback yet. Leave a note for this group."
            : "No producer feedback yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-border/70 bg-black/25 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{authorLabel(comment.author)}</span>
                <span>{formatWhen(comment.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
              {comment.reviewHref ? (
                <Link
                  href={comment.reviewHref as never}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-2")}
                >
                  <Play className="h-3.5 w-3.5" />
                  Open Review
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={mediaItemId ? "Write feedback for this clip…" : "Write feedback for this group…"}
            className="w-full resize-y rounded-lg border border-border bg-black/40 px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--brand-green)]/50"
          />
          <Button type="submit" size="sm" disabled={saving || !draft.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Post feedback
          </Button>
        </form>
      ) : null}
    </>
  );

  if (mediaItemId) {
    return (
      <section className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Feedback on this clip</h3>
          {comments.length > 0 ? (
            <span className="text-[11px] text-muted-foreground">{comments.length}</span>
          ) : null}
        </div>
        {thread}
      </section>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={cn("relative h-9 shrink-0", className)}
        onClick={() => {
          setOpen(true);
          void load(true);
        }}
      >
        <MessageSquare className="h-4 w-4" />
        {canWrite ? "Add Feedback" : "View Feedback"}
        {unread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-[var(--brand-green)] px-1 py-0.5 text-[10px] font-semibold leading-none text-[var(--ink)]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) void load(true);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Producer feedback</DialogTitle>
            <DialogDescription>
              {canWrite ? "Leave a note for this group." : "Feedback from your producer on this stage."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">{thread}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
