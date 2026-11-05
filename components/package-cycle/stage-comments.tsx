"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { CountBadge } from "@/components/kit/status-tag";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StageFeedbackPanel } from "@/components/package-stages/feedback-panel";
import { FeedbackComposer, FeedbackNotes } from "@/components/package-stages/feedback-thread";
import { useStageComments } from "@/components/package-stages/use-stage-comments";
import type { GroupStageSlug } from "@/src/lib/package-stages";
import { cn } from "@/src/lib/utils";

type StageCommentsProps = {
  rowId: string;
  stage: GroupStageSlug;
  canWrite: boolean;
  /** Clip mode: only this clip's notes, marked read on mount (A-roll watch dialog). */
  mediaItemId?: string;
  className?: string;
  onPosted?: () => void;
  /**
   * button (default): an h-9 outline "View feedback" / "Add feedback" button with an unread
   * count that opens the thread in a dialog. panel: the thread shown on the page as a card that
   * marks the stage read once it is on screen.
   */
  variant?: "button" | "panel";
  /** panel: the composer's label ("Request changes" on A-roll) and an optional helper line. */
  composerLabel?: ReactNode;
  composerHint?: ReactNode;
  /** panel: mark the notes that are new (students; see StageFeedbackPanel). */
  highlightNew?: boolean;
  /** panel: cap the notes with their own scroll from xl (off inside a rail that scrolls). */
  scrollNotes?: boolean;
  /** panel: replaces `className` classes while the thread is empty (or still loading). */
  emptyClassName?: string;
  /** panel: bump to re-fetch the thread quietly after the page reloads. */
  refreshSignal?: number;
};

/** A-roll notes from a producer are revision requests (they un-approve the stage and email the group). */
export const A_ROLL_COMPOSER_LABEL = "Request changes";
export const A_ROLL_COMPOSER_HINT = "Posting asks the group for changes and emails them.";
/** The A-roll submit button says what posting does. */
export const A_ROLL_SUBMIT_LABEL = "Request changes";

/** Thread + composer shared by the dialog and the clip view. */
function Thread({
  stage,
  canWrite,
  mediaItemId,
  onPosted,
  comments,
  loading,
  saving,
  post,
  resolvingId,
  setResolved
}: Pick<StageCommentsProps, "stage" | "canWrite" | "mediaItemId" | "onPosted"> &
  Pick<ReturnType<typeof useStageComments>, "comments" | "loading" | "saving" | "post" | "resolvingId" | "setResolved">) {
  const requestsChanges = stage === "a-roll";
  return (
    <>
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
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
        <FeedbackNotes
          comments={comments}
          onToggleResolved={(id, resolved) => void setResolved(id, resolved)}
          resolvingId={resolvingId}
        />
      )}
      {canWrite ? (
        <FeedbackComposer
          label={requestsChanges ? A_ROLL_COMPOSER_LABEL : "Add feedback"}
          hint={requestsChanges ? A_ROLL_COMPOSER_HINT : undefined}
          submitLabel={requestsChanges ? A_ROLL_SUBMIT_LABEL : undefined}
          placeholder={mediaItemId ? "Write feedback for this clip…" : "Write feedback for this group…"}
          saving={saving}
          submitVariant="default"
          onSubmit={async (text) => {
            const saved = await post(text);
            if (saved) onPosted?.();
            return saved;
          }}
        />
      ) : null}
    </>
  );
}

function ClipComments(props: StageCommentsProps & { mediaItemId: string }) {
  const state = useStageComments({ rowId: props.rowId, stage: props.stage, mediaItemId: props.mediaItemId });
  const { load } = state;

  useEffect(() => {
    void load(true);
  }, [load]);

  return (
    <section className={cn("space-y-3", props.className)}>
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="text-base font-semibold text-foreground">Feedback on this clip</h3>
        {state.comments.length > 0 ? (
          <span className="font-mono-broadcast text-[13px] tabular-nums text-muted-foreground">
            {state.comments.length}
          </span>
        ) : null}
      </div>
      <Thread
        stage={props.stage}
        canWrite={props.canWrite}
        mediaItemId={props.mediaItemId}
        onPosted={props.onPosted}
        {...state}
      />
    </section>
  );
}

function FeedbackButton(props: StageCommentsProps) {
  const state = useStageComments({ rowId: props.rowId, stage: props.stage });
  const { load, unread } = state;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn("h-9 shrink-0", props.className)}
        onClick={() => {
          setOpen(true);
          void load(true);
        }}
      >
        <MessageSquare aria-hidden />
        {props.canWrite ? "Add feedback" : "View feedback"}
        <CountBadge count={unread} srLabel={`${unread} unread`} />
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
              {props.canWrite ? "Leave a note for this group." : "Feedback from your producer on this stage."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <Thread stage={props.stage} canWrite={props.canWrite} onPosted={props.onPosted} {...state} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Producer feedback on one package stage. Three looks: the default button + dialog (Brainstorming,
 * Groups early stages), the on-page `panel` (stage pages), and clip mode (`mediaItemId`).
 */
export function StageComments(props: StageCommentsProps) {
  if (props.mediaItemId) {
    return <ClipComments {...props} mediaItemId={props.mediaItemId} />;
  }
  if (props.variant === "panel") {
    return (
      <StageFeedbackPanel
        rowId={props.rowId}
        stage={props.stage}
        canWrite={props.canWrite}
        onPosted={props.onPosted}
        composerLabel={props.composerLabel}
        composerHint={props.composerHint}
        submitLabel={props.stage === "a-roll" ? A_ROLL_SUBMIT_LABEL : undefined}
        highlightNew={props.highlightNew}
        scrollNotes={props.scrollNotes}
        className={props.className}
        emptyClassName={props.emptyClassName}
        refreshSignal={props.refreshSignal}
      />
    );
  }
  return <FeedbackButton {...props} />;
}
