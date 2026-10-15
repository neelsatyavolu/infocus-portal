"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Play, Upload } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Dropzone } from "@/components/kit/dropzone";
import { EmptyState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { Panel, PanelLink } from "@/components/kit/panel";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { FinalCutHeadlineDialog } from "@/components/package-cycle/final-cut-headline-dialog";
import { finalCutPrimaryAction, FinalCutProducerView } from "@/components/package-cycle/final-cut-producer-view";
import { FinalCutShowCard } from "@/components/package-cycle/final-cut-show-card";
import { PackageOfCycleBanner } from "@/components/package-cycle/package-of-cycle-card";
import ProducerFeedbackDialog from "@/components/package-cycle/producer-feedback-dialog";
import { A_ROLL_COMPOSER_HINT, A_ROLL_COMPOSER_LABEL, StageComments } from "@/components/package-cycle/stage-comments";
import { StageStatusChip } from "@/components/package-cycle/stage-status-chip";
import { ClipGrid, WatchClipDialog } from "@/components/package-stages/clip-grid";
import { CutVersions } from "@/components/package-stages/cut-versions";
import { FinalCutVideo } from "@/components/package-stages/final-cut-video";
import { RollKindDialog } from "@/components/package-stages/roll-kind-dialog";
import { stageReviewHref } from "@/components/package-stages/stage-video";
import { useDecisionLead } from "@/components/package-stages/decision-lead";
import { useStageDecisions, type DecisionAction } from "@/components/package-stages/stage-decision-actions";
import { DecisionBar, StudentStageHeader } from "@/components/package-stages/stage-header";
import { StageMessage } from "@/components/package-stages/stage-messages";
import { StageWorkspaceSkeleton } from "@/components/package-stages/stage-states";
import {
  approvalPathSteps,
  initialCutProgressLabel,
  producerProgressLine,
  stageStatusFor,
  stageStatusLabel,
  studentNextStep
} from "@/components/package-stages/stage-status";
import { personLabel, STAGE_TITLES, type StageMediaCard, type StageView } from "@/components/package-stages/types";
import { useFinalCutSaves } from "@/components/package-stages/use-final-cut-saves";
import { useStageUpload } from "@/components/package-stages/use-stage-upload";
import { useStageView } from "@/components/package-stages/use-stage-view";
import { WhereItStands } from "@/components/package-stages/where-it-stands";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import { approvalStageToReviewStage } from "@/src/lib/group-tile-status";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import { PRODUCER_FEEDBACK_ENABLED } from "@/src/lib/producer-feedback";
import { cn } from "@/src/lib/utils";

function uploadLabel(slug: CycleStageSlug, view: StageView) {
  if (slug === "a-roll") return "Upload videos";
  if (slug === "initial-cut") return (view.media ?? []).length > 0 ? "Upload new version" : "Upload Initial Cut";
  return view.allowSecondFinalCut ? "Upload revised Final Cut" : "Upload Final Cut";
}

/** The upload rule for a stage (students read it in Where it stands; Groups in the media hint). */
function uploadRule(slug: CycleStageSlug, hasMedia: boolean) {
  if (slug === "a-roll") return "Pick A-roll or B-roll, then one or more clips. Up to 30 GB per A-roll file, 15 GB per B-roll file.";
  if (slug === "initial-cut" && hasMedia) return "Each upload is a new version of the same Initial Cut.";
  return null;
}

function dropHint(slug: CycleStageSlug, hasMedia: boolean, withRule: boolean) {
  const hint = slug === "a-roll" ? "Drag clips here to upload." : "Drag a video here to upload.";
  const rule = withRule ? uploadRule(slug, hasMedia) : null;
  return rule ? `${rule} ${hint}` : hint;
}

function finalCutRule(allowSecondFinalCut: boolean | undefined) {
  return allowSecondFinalCut
    ? "Second revision: you can replace this Final Cut. The quality score is capped at 75%. Late turn-in is a separate 20%/30% penalty."
    : "You can only upload Final Cut once unless the first grade is below 75%.";
}

function emptyMediaTitle(slug: CycleStageSlug, reviewStage: 1 | 2 | 3 | undefined) {
  if (reviewStage === 2) return "No Stage 2 cut yet. Approve Stage 1 first.";
  if (reviewStage === 3) return "No Stage 3 cut yet. Approve Stage 2 first.";
  return slug === "final-cut" ? "No Final Cut uploaded yet." : "No videos uploaded yet.";
}

/** One 40px row on phones: each header action carries it (PageHeader holds children to h-9). */
const TOUCH = "max-sm:h-10";

/**
 * One package stage (A-roll/B-roll, Initial Cut or Final Cut), shared by the student pages
 * (/a-roll, /initial-cut, /final-cut) and Groups → group → stage (`rowId`, `producerChrome`,
 * `embedded`, and `reviewStage` for the Initial 1/2/3 tabs).
 * - Students: header plate ("Cycle 03 · <stage>" with the status tag, the topic as title, the
 *   group and producer, Refresh, one primary: Upload, or Go to Final Cut once the Initial Cut is
 *   approved), callouts, then the media panel (also the drop target) beside the rail from xl:
 *   Where it stands (next step, Initial Cut approval path, upload rule), what airs, feedback.
 *   Below xl it is one column: Where it stands, feedback when it has notes, media, what airs,
 *   then an empty (or still loading) feedback panel, so nothing jumps when the thread loads.
 * - Producers: a decision bar under the group's tabs (progress, decisions; only when there is
 *   something to read or decide, since the stage bar above names the status), the media
 *   panel beside feedback with a composer, and on Final Cut what airs, Package of the Cycle and
 *   grading. GroupStageShell draws the Initial Cut approval path, so it is skipped here.
 * Every reload after the first is quiet, so saves never swap the page for a spinner; each one
 * also re-fetches the feedback thread (as the old full reload did by remounting it).
 */
export function StageWorkspace({
  slug,
  rowId,
  producerChrome = false,
  embedded = false,
  reviewStage
}: {
  slug: CycleStageSlug;
  rowId?: string;
  producerChrome?: boolean;
  embedded?: boolean;
  reviewStage?: 1 | 2 | 3;
}) {
  const { view, loading, refreshing, error, reload } = useStageView(slug, rowId, reviewStage);
  // Bumped on every page reload so the feedback panel fetches its thread again too.
  const [feedbackSignal, setFeedbackSignal] = useState(0);
  const reloadAll = useCallback(() => {
    setFeedbackSignal((signal) => signal + 1);
    return reload();
  }, [reload]);
  const upload = useStageUpload({ slug, view, reload: reloadAll });
  const saves = useFinalCutSaves({ rowId: view?.row?.id ?? null, reload: reloadAll });
  const [watching, setWatching] = useState<StageMediaCard | null>(null);

  const media = view?.media ?? [];
  const row = view?.row;
  const grade = view?.finalCutGrade ?? null;
  const finalCutProducer = producerChrome && slug === "final-cut";
  const primaryAction = finalCutProducer
    ? finalCutPrimaryAction({
        canGrade: Boolean(grade?.canGrade),
        canSaveScores: Boolean(grade?.canGrade && grade.members.some((member) => !member.locked)),
        hasFinalCut: media.length > 0,
        queued: Boolean(row?.queuedForAirAt),
        gradesReadyToPublish: Boolean(grade && grade.complete && !grade.published)
      })
    : null;
  const decisions = useStageDecisions({
    slug,
    view,
    reviewStage,
    enabled: producerChrome,
    queuePrimary: primaryAction === "queue",
    approveOutline: slug === "initial-cut",
    reload: reloadAll
  });
  // Groups Initial Cut: the shell's approval path joins the decision bar once the stage has loaded.
  const decisionLead = useDecisionLead(
    producerChrome && slug === "initial-cut" && !loading && Boolean(view && !view.empty && view.row)
  );

  const title = STAGE_TITLES[slug];
  if (loading) {
    return <StageWorkspaceSkeleton slug={slug} embedded={embedded} className={embedded ? undefined : "route-enter"} />;
  }
  if (!view || view.empty || !row || (!view.unlocked && !view.isProducer)) {
    return (
      <StageMessage
        kind={!view ? "error" : view.empty || !row ? "empty" : "locked"}
        slug={slug}
        title={title}
        embedded={embedded}
        producerChrome={producerChrome}
        cycleNumber={row?.cycleNumber}
        error={error}
        topic={row?.groupTopic}
        refreshing={refreshing}
        onRetry={() => void reloadAll()}
      />
    );
  }

  const remainingExecs = row.remainingExecutiveSignoffs;
  const effectiveReviewStage = reviewStage ?? approvalStageToReviewStage(row.approvalStage);
  const progressLabel = initialCutProgressLabel(view);
  const stageStatus = stageStatusFor(slug, view);
  const statusTag = stageStatus ? (
    <StageStatusChip status={stageStatus} label={stageStatusLabel(stageStatus, remainingExecs)} />
  ) : null;
  const canUpload = Boolean(view.canUpload);
  const label = uploadLabel(slug, view);
  const uploadButton = canUpload ? (
    <Button
      type="button"
      variant={embedded ? "outline" : "default"}
      disabled={upload.uploading}
      onClick={upload.openUpload}
      className={TOUCH}
    >
      {upload.uploading ? <Spinner /> : <Upload aria-hidden />}
      {upload.uploading ? "Uploading…" : label}
    </Button>
  ) : null;

  const studentPage = !(embedded || producerChrome);

  let mediaBody: ReactNode;
  if (media.length === 0) {
    mediaBody = (
      <EmptyState
        icon={Upload}
        title={emptyMediaTitle(slug, reviewStage)}
        description={
          canUpload ? `Drag ${slug === "a-roll" ? "clips" : "a video"} here or use ${label} above.` : undefined
        }
        className="py-6"
      />
    );
  } else if (slug === "a-roll") {
    mediaBody = <ClipGrid media={media} showNew={view.isProducer} wide={embedded} onWatch={setWatching} />;
  } else if (slug === "initial-cut") {
    mediaBody = (
      <CutVersions media={media} collapsePlayer={producerChrome} />
    );
  } else {
    mediaBody = (
      <FinalCutVideo media={media} reviewStage={effectiveReviewStage} remainingExecutiveSignoffs={remainingExecs} />
    );
  }

  const mediaPanel = (
    <Dropzone bind={upload.fileDrop.bind} dragging={upload.fileDrop.dragging} disabled={!canUpload || upload.uploading}>
      <Panel
        titleAs="h2"
        title={
          slug === "a-roll"
            ? "Footage"
            : slug === "initial-cut"
              ? "Versions"
              : producerChrome
                ? "Final Cut"
                : "Your Final Cut"
        }
        count={media.length > 0 ? media.length : null}
        description={canUpload && !upload.uploading ? dropHint(slug, media.length > 0, !studentPage) : undefined}
        padding="md"
      >
        {mediaBody}
      </Panel>
    </Dropzone>
  );

  const feedbackPanel = (
    <StageComments
      key={`${row.id}:${slug}`}
      variant="panel"
      rowId={row.id}
      stage={slug}
      canWrite={Boolean(view.canComment)}
      onPosted={slug === "a-roll" ? () => void reload() : undefined}
      composerLabel={slug === "a-roll" ? A_ROLL_COMPOSER_LABEL : "Add feedback"}
      composerHint={slug === "a-roll" ? A_ROLL_COMPOSER_HINT : undefined}
      highlightNew={!view.isProducer}
      refreshSignal={feedbackSignal}
      // The student rail scrolls as one. Below xl, feedback with notes goes right after Where it
      // stands; while loading or empty it waits at the end, so the media never jumps.
      scrollNotes={!studentPage}
      className={studentPage ? "max-xl:order-2" : undefined}
      emptyClassName={studentPage ? "max-xl:order-5" : undefined}
    />
  );

  const callouts: ReactNode[] = [];
  if (slug === "final-cut" && !producerChrome && row.packageOfCycleAt) {
    callouts.push(<PackageOfCycleBanner key="potc" rowId={row.id} />);
  }
  // Students read the Final Cut rule in Where it stands; on Groups it stays a callout.
  if (slug === "final-cut" && canUpload && !studentPage) {
    callouts.push(
      <Alert key="rule" tone="warning">
        {finalCutRule(view.allowSecondFinalCut)}
      </Alert>
    );
  }

  const dialogs = (
    <>
      {canUpload ? <input {...upload.fileInputProps} /> : null}
      <RollKindDialog {...upload.rollDialog} />
      <FinalCutHeadlineDialog
        {...upload.headlineDialog}
        initialHeadline={row.headline ?? ""}
        initialToss={row.toss ?? ""}
      />
      <FinalCutHeadlineDialog
        open={saves.tossOpen}
        mode="toss"
        initialHeadline=""
        initialToss={row.toss ?? ""}
        saving={saves.savingToss}
        onOpenChange={saves.setTossOpen}
        onContinue={({ toss }) => void saves.saveToss(toss)}
      />
      <WatchClipDialog
        clip={watching}
        rowId={row.id}
        canComment={Boolean(view.canComment)}
        onClose={() => {
          setWatching(null);
          void reloadAll();
        }}
        onPosted={() => void reload()}
      />
      <ConfirmDialog
        open={upload.finalCutConfirm.open}
        onOpenChange={upload.finalCutConfirm.onOpenChange}
        title="Upload this Final Cut?"
        description={`Headline: "${upload.finalCutConfirm.headline}". You cannot replace it later unless the first grade is below 75%.`}
        confirmLabel="Upload Final Cut"
        cancelLabel="Not yet"
        tone="default"
        onConfirm={upload.finalCutConfirm.onConfirm}
      />
      {decisions.dialogs}
      <UploadProgressToast items={upload.uploadItems} />
    </>
  );

  if (embedded || producerChrome) {
    const currentReview = approvalStageToReviewStage(row.approvalStage);
    const otherStageNote =
      slug === "initial-cut" && reviewStage && currentReview && reviewStage !== currentReview && rowId ? (
        row.approvalStage === "APPROVED" ? (
          <>
            <span>Approved for Final Cut.</span>
            <PanelLink href={`/groups/${rowId}/final-cut`}>Go to Final</PanelLink>
          </>
        ) : (
          <>
            <span>This package is in Stage {currentReview}.</span>
            <PanelLink href={`/groups/${rowId}/initial-stage-${currentReview}`}>
              Go to Initial {currentReview}
            </PanelLink>
          </>
        )
      ) : null;
    const newClips = slug === "a-roll" && view.isProducer ? media.filter((item) => item.isNew).length : 0;
    // Initial Cut on Groups: opening the newest version's review is the main thing to do here.
    const latestCut = slug === "initial-cut" ? media[0] : undefined;
    const latestReviewHref = latestCut ? stageReviewHref(latestCut, true) : null;
    const openReview: DecisionAction[] = latestCut && latestReviewHref
      ? [
          {
            key: "open-review",
            dock: true,
            node: (
              <Link href={latestReviewHref as never} className={cn(buttonVariants(), "px-5 font-semibold max-lg:px-3")}>
                <Play aria-hidden />
                {`Open review · v${latestCut.versionNumber}`}
              </Link>
            )
          }
        ]
      : [];
    const actions: DecisionAction[] = [
      ...openReview,
      ...decisions.actions,
      ...(uploadButton ? [{ key: "upload", node: uploadButton }] : [])
    ];
    // GroupStageShell's open stage cell names the status, except Locked (that cell only dims) and
    // A/B-roll (that cell only knows Approved or Locked), so the bar tags those and the new-clips count.
    const locked = stageStatus === "locked";
    const tagHere = locked || slug === "a-roll";
    const barStatus =
      tagHere || newClips > 0 ? (
        <>
          {tagHere ? statusTag : null}
          {newClips > 0 ? <StatusTag tone="success">{`${newClips} new since your request`}</StatusTag> : null}
        </>
      ) : null;
    // On an Initial tab that is not the package's current stage, the note (with its link) replaces
    // the current stage's progress line, which the approval path above already shows.
    const progress = otherStageNote ? null : producerProgressLine(slug, stageStatus, view, progressLabel);
    // Only when there is something to read or decide: no bar repeating the stage bar's status.
    const showDecisionBar = actions.length > 0 || Boolean(decisionLead || otherStageNote || barStatus || progress);

    return (
      // A flex column so the decision bar's phone-dock spacer (its aria-hidden child) moves to the
      // end: the docked buttons then never cover the feedback composer, and no gap opens under the bar.
      <div className="flex min-w-0 flex-col gap-5 [&>[aria-hidden]]:order-last">
        {showDecisionBar ? (
          <DecisionBar
            heading={`${title}${reviewStage ? ` · Stage ${reviewStage}` : ""}`}
            status={barStatus}
            progress={progress}
            note={otherStageNote}
            actions={actions}
            lead={decisionLead}
          />
        ) : null}
        {callouts}
        {finalCutProducer ? (
          <FinalCutProducerView
            rowId={row.id}
            media={mediaPanel}
            feedback={feedbackPanel}
            hasFinalCut={media.length > 0}
            headline={row.headline ?? null}
            toss={row.toss ?? ""}
            canEditToss={Boolean(view.canEditToss)}
            onEditToss={() => saves.setTossOpen(true)}
            packageOfCycle={view.packageOfCycle ?? null}
            members={row.members}
            onReload={() => void reloadAll()}
            grade={grade}
            onSaveGrade={saves.saveGrade}
            gradeMessage={saves.gradePreview}
            savingFeedback={saves.savingFeedback}
            publishingGrades={saves.publishingGrades}
            onSaveFeedback={(next) => void saves.saveCycleFeedback(next)}
            onPublishGrades={(next) => void saves.publishCycleGrades(next)}
            primaryAction={primaryAction}
          />
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="min-w-0">{mediaPanel}</div>
            <div className="min-w-0 space-y-5">{feedbackPanel}</div>
          </div>
        )}
        {dialogs}
      </div>
    );
  }

  // Initial Cut approved and no Final Cut yet: the next step is the Final Cut page (no upload here).
  const goToFinalCut =
    slug === "initial-cut" && !view.isProducer && !canUpload && row.approvalStage === "APPROVED" && !row.finalCut ? (
      <Link href="/final-cut" className={cn(buttonVariants(), TOUCH)}>
        Go to Final Cut
        <ArrowRight aria-hidden />
      </Link>
    ) : null;
  const memberNames = row.members.map((member) => personLabel(member)).join(", ");
  const producerName = row.assignedProducer ? personLabel(row.assignedProducer, "") : "";
  // FinalCutShowCard hides itself when there is nothing to show and no toss to add; skip its slot too.
  const showWhatAirs = slug === "final-cut" && Boolean(row.headline || (row.toss ?? "").trim() || view.canEditToss);
  const whatAirs = showWhatAirs ? (
    <FinalCutShowCard
      headline={row.headline ?? null}
      toss={row.toss ?? ""}
      canEdit={Boolean(view.canEditToss)}
      onEdit={() => saves.setTossOpen(true)}
    />
  ) : null;

  return (
    // lg:pb-18 keeps the last card clear of the ✱ launcher and the upload progress card.
    <div className="route-enter space-y-5 lg:pb-18">
      <StudentStageHeader
        eyebrow={`${cycleLabel(row.cycleNumber)} · ${title}`}
        status={statusTag}
        title={row.groupTopic || "My package"}
        description={[memberNames, `Producer: ${producerName || "not assigned yet"}`].filter(Boolean).join(" · ")}
        refreshing={refreshing}
        onRefresh={() => void reloadAll()}
        actions={
          <>
            {PRODUCER_FEEDBACK_ENABLED ? (
              <ProducerFeedbackDialog initialCycle={row.cycleNumber} triggerClassName={TOUCH} />
            ) : null}
            {uploadButton ?? goToFinalCut}
          </>
        }
      />
      {callouts}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 max-xl:order-3">{mediaPanel}</div>
        {/*
          Below xl `contents` lets the rail's cards take their own order (see the doc above).
          From xl the rail sticks and scrolls as one area.
        */}
        <div className="min-w-0 max-xl:contents xl:sticky xl:top-[calc(var(--app-header-h,0px)+1rem)] xl:max-h-[calc(100dvh-var(--app-header-h,0px)-2rem)] xl:space-y-5 xl:overflow-y-auto">
          <WhereItStands
            className="max-xl:order-1"
            nextStep={studentNextStep(slug, stageStatus, { hasFinalCut: Boolean(row.finalCut) })}
            approvalSteps={
              slug === "initial-cut"
                ? approvalPathSteps({
                    approvalStage: row.approvalStage,
                    hasMedia: media.length > 0,
                    needsRevisions: Boolean(row.initialCutNeedsRevisions),
                    awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
                    remainingExecutiveSignoffs: remainingExecs
                  })
                : null
            }
            rule={canUpload ? uploadRule(slug, media.length > 0) : null}
            warning={slug === "final-cut" && canUpload ? finalCutRule(view.allowSecondFinalCut) : null}
          />
          {whatAirs ? <div className="min-w-0 max-xl:order-4">{whatAirs}</div> : null}
          {feedbackPanel}
        </div>
      </div>
      {dialogs}
    </div>
  );
}
