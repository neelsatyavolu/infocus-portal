"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DisclosureToggle } from "@/components/kit/disclosure";
import { Panel } from "@/components/kit/panel";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { formatCount } from "@/components/kit/tone";
import { FeedbackComposer, FeedbackNotes, isReviewNotice } from "@/components/package-stages/feedback-thread";
import { useStageComments } from "@/components/package-stages/use-stage-comments";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";

/** Notes shown below xl (one column) before "Show all". */
const FOLDED_LIMIT = 3;

type NewNotes = { ids: ReadonlySet<string>; onClips: number; stageUnread: number };

const NO_NEW: NewNotes = { ids: new Set(), onClips: 0, stageUnread: 0 };

function addNew(base: NewNotes, result: { threadIds: string[]; onClips: number; unread: number }): NewNotes {
  return {
    ids: new Set([...base.ids, ...result.threadIds]),
    onClips: base.onClips + result.onClips,
    stageUnread: base.stageUnread + result.unread
  };
}

/**
 * The stage's producer feedback, always visible on the page (no dialog). It loads without
 * marking read first, so new notes can be shown; once the panel is on screen it marks the stage
 * read (same API call and STAGE_FEEDBACK_READ_EVENT as opening the old dialog), and the new marks
 * stay for the rest of the visit. Each change of `refreshSignal` (the page's Refresh, an upload,
 * a closed clip) re-fetches the thread quietly and marks any newer notes the same way.
 * - `highlightNew` (students, who never write notes): the unread notes get a New tag and a green
 *   edge, with "N new" beside the title and "N new on clips" when clip notes are unread too.
 * - Otherwise (producers, whose own notes the server leaves out of the count): one "N unread"
 *   tag for the stage, as the old Add Feedback button showed.
 */
export function StageFeedbackPanel({
  rowId,
  stage,
  canWrite,
  onPosted,
  composerLabel = "Add feedback",
  composerHint,
  submitLabel,
  highlightNew = false,
  scrollNotes = true,
  refreshSignal = 0,
  className,
  emptyClassName
}: {
  rowId: string;
  stage: GroupStageSlug;
  canWrite: boolean;
  onPosted?: () => void;
  composerLabel?: ReactNode;
  composerHint?: ReactNode;
  submitLabel?: string;
  highlightNew?: boolean;
  /** Cap the notes list with its own scroll from xl (off when the whole rail already scrolls). */
  scrollNotes?: boolean;
  /** Bump to re-fetch the thread quietly (the page reloaded). */
  refreshSignal?: number;
  className?: string;
  /** Replaces `className` classes (e.g. phone order) while there are no notes, loading included. */
  emptyClassName?: string;
}) {
  const { comments, loading, saving, resolvingId, load, post, setResolved } = useStageComments({ rowId, stage });
  const [fresh, setFresh] = useState<NewNotes>(NO_NEW);
  const [markPending, setMarkPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // `fresh` as last set, and the part of it already marked read on the server: a later fetch
  // counts only notes newer than that, so its counts add to this base.
  const freshRef = useRef<NewNotes>(NO_NEW);
  const readBase = useRef<NewNotes>(NO_NEW);
  const lastSignal = useRef(refreshSignal);
  const [loadedWith, setLoadedWith] = useState(() => load);
  if (load !== loadedWith) {
    setLoadedWith(() => load);
    setFresh(NO_NEW);
    setMarkPending(false);
  }

  useEffect(() => {
    let cancelled = false;
    freshRef.current = NO_NEW;
    readBase.current = NO_NEW;
    void load(false).then((result) => {
      if (cancelled || !result) return;
      freshRef.current = addNew(NO_NEW, result);
      setFresh(freshRef.current);
      setMarkPending(result.unread > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (refreshSignal === lastSignal.current) return;
    lastSignal.current = refreshSignal;
    let cancelled = false;
    // The server counts from its read mark as of this fetch, so add to the base as of now.
    const base = readBase.current;
    void load(false, { quiet: true }).then((result) => {
      if (cancelled || !result) return;
      freshRef.current = addNew(base, result);
      setFresh(freshRef.current);
      if (result.unread > 0) setMarkPending(true);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshSignal, load]);

  useEffect(() => {
    if (!markPending) return;
    const markRead = () => {
      setMarkPending(false);
      readBase.current = freshRef.current;
      void load(true, { quiet: true });
    };
    const node = panelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      markRead();
      return;
    }
    // On screen = the panel's top has reached the upper 70% of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        markRead();
      },
      { rootMargin: "0px 0px -30% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [markPending, load]);

  // Folding counts written notes only: review notices sit in their own closed Review activity line.
  const noteCount = comments.filter((comment) => !isReviewNotice(comment)).length;
  const foldable = noteCount > FOLDED_LIMIT;
  // Loading counts as empty, so a thread that turns out empty never moves the page below it.
  const empty = comments.length === 0;
  const status = highlightNew ? (
    fresh.ids.size > 0 || fresh.onClips > 0 ? (
      <>
        {fresh.ids.size > 0 ? <StatusTag tone="success">{`${formatCount(fresh.ids.size)} new`}</StatusTag> : null}
        {fresh.onClips > 0 ? (
          <StatusTag tone="success" title="Open a clip to read its notes">
            {`${formatCount(fresh.onClips)} new on clips`}
          </StatusTag>
        ) : null}
      </>
    ) : null
  ) : fresh.stageUnread > 0 ? (
    <StatusTag tone="success">{`${formatCount(fresh.stageUnread)} unread`}</StatusTag>
  ) : null;

  return (
    <div ref={panelRef} className={cn("min-w-0", className, empty && emptyClassName)}>
      <Panel
        id={`stage-feedback-${stage}`}
        title="Feedback"
        titleAs="h2"
        count={comments.length > 0 ? comments.length : null}
        status={status}
        padding="md"
        bodyClassName="space-y-4"
      >
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Loading feedback…
          </p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canWrite ? "No feedback yet. Leave a note for this group." : "No producer feedback yet."}
          </p>
        ) : (
          <div className="min-w-0">
            <FeedbackNotes
              comments={comments}
              newIds={highlightNew ? fresh.ids : undefined}
              foldFrom={expanded ? undefined : FOLDED_LIMIT}
              onToggleResolved={(id, resolved) => void setResolved(id, resolved)}
              resolvingId={resolvingId}
              className={scrollNotes ? "xl:max-h-[min(60vh,36rem)] xl:overflow-y-auto xl:pr-1" : undefined}
            />
            {foldable ? (
              <DisclosureToggle
                open={expanded}
                onToggle={() => setExpanded((open) => !open)}
                closedLabel={`Show all (${noteCount})`}
                openLabel="Show fewer"
                className="mt-2 xl:hidden"
              />
            ) : null}
          </div>
        )}
        {canWrite ? (
          <FeedbackComposer
            label={composerLabel}
            hint={composerHint}
            submitLabel={submitLabel}
            placeholder="Write feedback for this group…"
            saving={saving}
            onSubmit={async (text) => {
              const saved = await post(text);
              if (saved) onPosted?.();
              return saved;
            }}
          />
        ) : null}
      </Panel>
    </div>
  );
}
