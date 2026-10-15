"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, MessageSquare } from "lucide-react";
import { isTypingTarget } from "@/components/kit/hotkeys";
import { useMediaQuery, useRememberedState } from "@/components/kit/remembered-state";
import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import { RelativeAge } from "@/components/relative-age";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommentComposer, ComposerClosed } from "@/components/review/comment-composer";
import type { ThreadPermissions } from "@/components/review/comment-thread";
import {
  buildThreads,
  clampToDuration,
  commentSeekTimeSeconds,
  commentsExportBaseName,
  filterThreads,
  formatAiredLabel,
  generalThreads,
  isCommentFilter,
  mergeRefreshedVersions,
  newThreadIds,
  threadNumbers,
  timelineThreads,
  type CommentFilter,
  type CommentThread,
  type CommentsTab,
  type ReviewComment,
  type ReviewVersion
} from "@/components/review/comment-utils";
import { CommentsPanel } from "@/components/review/comments-panel";
import { canShowQuickGradesForFolder, parseCycleFromProjectName } from "@/components/review/quick-grades";
import { QuickGradesPanel, QuickGradesSheet } from "@/components/review/quick-grades-panel";
import {
  ApprovalStrip,
  hasPackageDecision,
  packageApprovalSteps,
  packageHelperText,
  reviewDecisionButtons
} from "@/components/review/review-decisions";
import { ReviewDialogs, type DeleteRequest } from "@/components/review/review-dialogs";
import { ReviewDecisionCard, ReviewHeader, ReviewPhoneToolbar, reviewToolButtons } from "@/components/review/review-header";
import { ReviewPlayer } from "@/components/review/review-player";
import { ReviewSplitter } from "@/components/review/review-splitter";
import { ReviewTranscript } from "@/components/review/review-transcript";
import { GoToLatestButton, ReviewVersionSelect, type VersionActivity } from "@/components/review/review-version-select";
import { useHlsPlayer } from "@/components/review/use-hls-player";
import { useQuickGrades } from "@/components/review/use-quick-grades";
import { useReviewComments } from "@/components/review/use-review-comments";
import { useReviewDecisions } from "@/components/review/use-review-decisions";
import { useReviewPlayback } from "@/components/review/use-review-playback";
import { isVersionNewSince, useReviewSeen, versionBaseline, type ReviewSeenRecord } from "@/components/review/use-review-seen";
import { useReviewShortcuts } from "@/components/review/use-review-shortcuts";
import { useReviewSplitLayout } from "@/components/review/use-review-split-layout";
import { useTranscripts } from "@/components/review/use-transcripts";
import { buildCommentsCsv } from "@/src/lib/comment-export-csv";
import { approvalStageToReviewStage, cutTileReviewStatus } from "@/src/lib/group-tile-status";
import { initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import { canResolveComment, canUploadVersion } from "@/src/lib/rbac";
import { DEFAULT_REVIEW_FPS, frameNumberFromSeconds } from "@/src/lib/timecode";
import type { MediaReviewDto } from "@/src/lib/types";
import { cn } from "@/src/lib/utils";

type ReviewShellProps = {
  data: MediaReviewDto;
  guestToken?: string;
  /** A view-only guest link. */
  isGuest?: boolean;
  allowComment?: boolean;
  /** An Initial Cut: the title follows the selected version ("Initial Cut Version N"). */
  isInitialCut?: boolean;
};

const PANEL_ID = "review-comments-panel";
const GRADES_PANEL_ID = "review-quick-grades-panel";

/** The version's status in the same words as the Groups stage tiles (cutTileReviewStatus). */
function primaryStatus(version: ReviewVersion | undefined, packageReview: MediaReviewDto["packageReview"]): { label: string; tone: StatusToneInput } {
  if (version?.approvalStatus === "AIRED") {
    return { label: `Aired${version.airedAt ? ` · ${formatAiredLabel(version.airedAt)}` : ""}`, tone: "success" };
  }
  return cutTileReviewStatus({
    approvalStatus: version?.approvalStatus,
    reviewStage: approvalStageToReviewStage(packageReview?.stage),
    approvedInStage: version?.approvedInStage,
    remainingExecutiveSignoffs: packageReview?.remainingExecutiveSignoffs
  });
}

/** Per version: its threads, and how many threads have something new since the last visit. */
function buildVersionActivity(
  versions: ReviewVersion[],
  comments: ReviewComment[],
  seen: ReviewSeenRecord | null,
  rule: { localIds: ReadonlySet<string>; currentUserId: string | null }
): VersionActivity {
  const threadCounts = new Map<string, number>();
  const newCounts = new Map<string, number>();
  for (const version of versions) {
    const threads = buildThreads(comments.filter((comment) => comment.mediaVersionId === version.id));
    threadCounts.set(version.id, threads.length);
    newCounts.set(version.id, newThreadIds(threads, { ...rule, baseline: versionBaseline(seen, version.id) }).size);
  }
  const newVersionIds = new Set(versions.filter((version) => isVersionNewSince(seen, version)).map((version) => version.id));
  return { threadCounts, newCounts, newVersionIds };
}

/**
 * The video/image review page (and guest links). Header plate on top; below it the player and
 * the comments panel side by side from 1024px, or stacked on phones and tablets with the player
 * pinned and the composer docked. See components/review/* for the parts.
 */
export function ReviewShell({ data, guestToken, isGuest = false, allowComment = true, isInitialCut = false }: ReviewShellProps) {
  const router = useRouter();
  // The app shell drops its floating Assistant button on bare reviews; guest links have no shell.
  const isBareReview = useSearchParams().get("bare") === "1";
  const hasAssistantLauncher = !guestToken && !isBareReview;
  const signedIn = !guestToken;
  const touch = useMediaQuery("(pointer: coarse)", false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const [versions, setVersions] = useState(data.versions);
  const [currentVersionId, setCurrentVersionId] = useState(data.currentVersionId);
  const comments = useReviewComments({ initialComments: data.comments, guestToken });
  const [syncedData, setSyncedData] = useState(data);
  // Refresh / Check again re-render the page with new data: take it. The selection stays unless the
  // page asked for another version (a ?version link) or the selected one is gone. Only the version
  // still on screen keeps its playback URL; the others take the fresh (re-signed) links.
  if (syncedData !== data) {
    const keepSelection =
      data.currentVersionId === syncedData.currentVersionId && data.versions.some((version) => version.id === currentVersionId);
    const nextVersionId = keepSelection ? currentVersionId : data.currentVersionId;
    setSyncedData(data);
    setVersions(mergeRefreshedVersions(versions, data.versions, nextVersionId === currentVersionId ? currentVersionId : null));
    comments.replaceAll(data.comments);
    if (nextVersionId !== currentVersionId) {
      setCurrentVersionId(nextVersionId);
    }
  }

  const [tab, setTab] = useState<CommentsTab>("TIMELINE");
  const [filter, setFilter] = useRememberedState<CommentFilter>("review:filter:v1", "ALL", isCommentFilter);
  const [composerBody, setComposerBody] = useState("");
  const [generalBody, setGeneralBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingGeneral, setSubmittingGeneral] = useState(false);
  const [composerPin, setComposerPin] = useState<{ xPct: number; yPct: number } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transcriptReadyFor, setTranscriptReadyFor] = useState<string | null>(null);
  const [isMacDesktopApp, setIsMacDesktopApp] = useState(false);

  useEffect(() => {
    setIsMacDesktopApp(/InFocusMacApp/i.test(window.navigator.userAgent));
  }, []);

  const currentVersion = useMemo(
    () => versions.find((version) => version.id === currentVersionId) ?? versions[0],
    [versions, currentVersionId]
  );
  const latestVersion = versions[0];
  const isLatest = !currentVersion || currentVersion.id === latestVersion?.id;
  const isImageReview = currentVersion?.sourceType === "IMAGE";
  const hasVideo = !isImageReview && Boolean(currentVersion?.playbackUrl);
  const title = isInitialCut && currentVersion ? initialCutVersionTitle(currentVersion.versionNumber) : data.title;
  const packageReview = data.packageReview;
  const canUseFile = signedIn && !isImageReview && currentVersion?.status === "READY";
  const downloadHref = canUseFile && currentVersion ? `/api/media/${data.mediaId}/download?mediaVersionId=${currentVersion.id}` : null;

  useHlsPlayer(videoRef, isImageReview ? null : currentVersion?.playbackUrl);
  const playback = useReviewPlayback({ videoRef, versionId: currentVersionId, isImageReview, hasVideo });
  const layout = useReviewSplitLayout({
    refs: { root: rootRef, split: splitRef, card: cardRef, stage: stageRef, controls: controlsRef },
    isImageReview,
    layoutKey: `${currentVersionId}:${hasVideo}`,
    isMacDesktopApp
  });

  const quickGradeCycle = useMemo(() => parseCycleFromProjectName(data.projectName), [data.projectName]);
  const quickGrades = useQuickGrades({
    enabled: signedIn && !isGuest && !isImageReview && data.canManageQuickGrades && canShowQuickGradesForFolder(data.folderName),
    cycleNumber: quickGradeCycle,
    assignedPeople: data.assignedPeople
  });
  const closeQuickGrades = quickGrades.close;
  useEffect(() => {
    closeQuickGrades();
  }, [currentVersionId, closeQuickGrades]);

  // A finished transcript opens its tab, unless the viewer is writing: then the tab gets a dot.
  const transcripts = useTranscripts({
    mediaId: data.mediaId,
    activeVersionId: currentVersionId,
    onReady: (versionId) => {
      const writing = isTypingTarget(document.activeElement) || composerBody.trim() !== "" || generalBody.trim() !== "";
      if (writing) {
        setTranscriptReadyFor(versionId);
        toast.success("Transcript ready", { description: "It's in the Transcript tab." });
      } else {
        setTab("TRANSCRIPT");
      }
    }
  });
  const activeTab: CommentsTab = tab === "TRANSCRIPT" && !canUseFile ? "TIMELINE" : tab;
  function changeTab(next: CommentsTab) {
    setTab(next);
    if (next === "TRANSCRIPT") {
      setTranscriptReadyFor(null);
    }
  }

  const decisions = useReviewDecisions({ mediaId: data.mediaId, packageReview, currentVersion, isGuest, setVersions });

  // Comments for this version, as threads with stable numbers, and what's new since the last visit.
  const seen = useReviewSeen(data.mediaId, currentVersionId);
  const versionComments = useMemo(
    () => comments.comments.filter((comment) => comment.mediaVersionId === currentVersionId),
    [comments.comments, currentVersionId]
  );
  const threads = useMemo(() => buildThreads(versionComments), [versionComments]);
  const timeline = useMemo(() => timelineThreads(threads, isImageReview), [threads, isImageReview]);
  const general = useMemo(() => generalThreads(threads), [threads]);
  const timelineNumbers = useMemo(() => threadNumbers(timeline), [timeline]);
  const generalNumbers = useMemo(() => threadNumbers(general), [general]);
  const newIds = useMemo(
    () =>
      newThreadIds(threads, {
        baseline: versionBaseline(seen, currentVersionId),
        localIds: comments.localIds,
        currentUserId: data.currentUserId
      }),
    [comments.localIds, currentVersionId, data.currentUserId, seen, threads]
  );
  const versionActivity = useMemo(
    () => buildVersionActivity(versions, comments.comments, seen, { localIds: comments.localIds, currentUserId: data.currentUserId }),
    [comments.comments, comments.localIds, data.currentUserId, seen, versions]
  );

  const timelineDuration =
    playback.duration > 0 ? playback.duration : Math.max(1, ...timeline.map((thread) => thread.root.timeSeconds));

  function changeVersion(versionId: string) {
    setCurrentVersionId(versionId);
    comments.setSelectedCommentId(null);
    setComposerPin(null);
  }

  /** Shows the "All" filter when the current one would hide this thread. */
  function revealInFilter(thread: CommentThread) {
    if (filterThreads([thread], filter).length === 0) {
      setFilter("ALL");
    }
  }

  /** Select a thread: seek to it (video) or show its pin (image); optionally scroll the list to it. */
  function focusThread(thread: CommentThread, options?: { scroll?: boolean }) {
    comments.focusThread(thread.root.id, { scroll: options?.scroll });
    if (isImageReview) {
      if (thread.root.xPct !== null && thread.root.yPct !== null) {
        setComposerPin({ xPct: thread.root.xPct, yPct: thread.root.yPct });
      }
    } else {
      playback.seekTo(commentSeekTimeSeconds(thread.root));
    }
    if (options?.scroll) {
      changeTab("TIMELINE");
      revealInFilter(thread);
    }
  }

  function jumpToNew() {
    const target = timeline.find((thread) => newIds.has(thread.root.id)) ?? general.find((thread) => newIds.has(thread.root.id));
    if (!target) {
      return;
    }
    changeTab(target.root.targetType === "GENERAL" ? "GENERAL" : "TIMELINE");
    revealInFilter(target);
    comments.setPendingScrollId(target.root.id);
  }

  function onCanvasClick(event: MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!allowComment || !isImageReview || !canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    setComposerPin({
      xPct: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      yPct: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    });
    comments.setSelectedCommentId(null);
  }

  async function submitTimelineComment() {
    if (!allowComment || !composerBody.trim() || !currentVersion || (isImageReview && !composerPin)) {
      return;
    }
    const time = isImageReview ? 0 : clampToDuration(playback.playheadStore.get(), playback.duration);
    setSubmittingComment(true);
    const created = await comments.createComment({
      mediaVersionId: currentVersion.id,
      targetType: isImageReview ? "FRAME_PIN" : "TIMECODE",
      timeSeconds: time,
      frameNumber: isImageReview ? 0 : frameNumberFromSeconds(time, DEFAULT_REVIEW_FPS),
      xPct: isImageReview ? composerPin?.xPct : undefined,
      yPct: isImageReview ? composerPin?.yPct : undefined,
      body: composerBody
    });
    setSubmittingComment(false);
    if (created) {
      changeTab("TIMELINE");
      // A remembered "Resolved" filter would hide the new comment; show it.
      revealInFilter({ root: created, replies: [] });
      comments.focusThread(created.id, { scroll: true });
      setComposerBody("");
      if (isImageReview) {
        setComposerPin(null);
      }
    }
  }

  async function submitGeneralComment() {
    if (!allowComment || !generalBody.trim() || !currentVersion) {
      return;
    }
    setSubmittingGeneral(true);
    const created = await comments.createComment({ mediaVersionId: currentVersion.id, targetType: "GENERAL", body: generalBody });
    setSubmittingGeneral(false);
    if (created) {
      revealInFilter({ root: created, replies: [] });
      setGeneralBody("");
    }
  }

  function exportCsv() {
    const csv = buildCommentsCsv(versionComments);
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${commentsExportBaseName(title, currentVersion?.versionNumber)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importCsv(file: File) {
    if (!currentVersion || currentVersion.sourceType !== "VIDEO") {
      toast.error("CSV import is only available for video reviews.");
      return;
    }
    void comments.importCsv(currentVersion.id, file);
  }

  useReviewShortcuts({
    rootRef,
    isImageReview,
    hasVideo,
    allowComment,
    transcriptOpen: activeTab === "TRANSCRIPT",
    onOpenTimeline: () => changeTab("TIMELINE"),
    composerRef,
    comments,
    playback
  });

  // Header: status says it once (tag), the strip shows the path, the line says what to do (on a
  // desktop the strip takes the line's place and the instruction sits under the decision buttons).
  const status = primaryStatus(currentVersion, packageReview);
  const eyebrow = guestToken ? data.projectName : `Review · ${data.projectName}${data.folderName ? ` / ${data.folderName}` : ""}`;
  const approvalStrip = packageReview ? (
    <ApprovalStrip
      steps={packageApprovalSteps(packageReview, latestVersion)}
      youCanDecide={hasPackageDecision(packageReview)}
      statusLabel={status.label}
    />
  ) : null;
  const helper = packageReview ? packageHelperText(packageReview) : null;
  const uploadedLine = currentVersion ? <RelativeAge iso={currentVersion.createdAt} prefix="Uploaded " suffix=" ago" /> : null;
  const decisionButtons = signedIn
    ? reviewDecisionButtons({
        packageReview,
        canUpdateApprovalStatus: data.canUpdateApprovalStatus,
        version: currentVersion,
        handlers: {
          isLatest,
          submittingReview: decisions.submittingReview,
          statusUpdating: decisions.statusUpdating,
          onSubmitReview: () => void decisions.submitReview(),
          onUnapprove: () => void decisions.approve(undefined, true),
          onApprove: () => decisions.setApproveFeedbackOpen(true),
          onApproveAnyway: () => decisions.setApproveAnywayOpen(true),
          onChangeStatus: (next) => void decisions.changeStatus(next),
          onMarkAired: decisions.openAiredDialog
        }
      })
    : null;
  // One filled button per view: the decision if there is one, otherwise the desktop grades panel's
  // Save while it's open, otherwise the composer's Send.
  const headerHasPrimary =
    signedIn &&
    (packageReview
      ? Boolean(packageReview.canApprove || packageReview.canApproveAnyway)
      : data.canUpdateApprovalStatus && currentVersion?.approvalStatus !== "AIRED");
  const toolProps = {
    downloadHref,
    showGrades: quickGrades.enabled,
    gradesOpen: quickGrades.open,
    onToggleGrades: quickGrades.toggle,
    onRefresh: () => router.refresh()
  };
  const goToLatest = (size: "md" | "touch") =>
    !isLatest && latestVersion ? (
      <GoToLatestButton latestVersionNumber={latestVersion.versionNumber} onGoToLatest={() => changeVersion(latestVersion.id)} size={size} />
    ) : null;
  const versionSelect = (size: "md" | "touch") => (
    <ReviewVersionSelect versions={versions} value={currentVersionId} onChange={changeVersion} activity={versionActivity} size={size} />
  );

  const permissions: ThreadPermissions = {
    currentUserId: data.currentUserId,
    canReply: allowComment,
    canEditOwn: signedIn && allowComment,
    canEditOwnReplies: signedIn,
    canDelete: signedIn && allowComment,
    canResolveAny: signedIn && allowComment && canResolveComment(data.workspaceRole, false),
    canResolveOwn: signedIn && allowComment && canResolveComment(data.workspaceRole, true)
  };
  // On a desktop, Quick grades takes the comments panel's place, beside the picture.
  const gradesInPanel = quickGrades.open && layout.isDesktopSplitLayout;
  const generalTab = activeTab === "GENERAL";
  const composer = allowComment ? (
    <CommentComposer
      ref={composerRef}
      kind={generalTab ? "general" : "timeline"}
      isImageReview={isImageReview}
      pin={composerPin}
      playhead={playback.playheadStore}
      value={generalTab ? generalBody : composerBody}
      onChange={generalTab ? setGeneralBody : setComposerBody}
      onSend={() => void (generalTab ? submitGeneralComment() : submitTimelineComment())}
      sending={generalTab ? submittingGeneral : submittingComment}
      primary={!headerHasPrimary && !gradesInPanel}
      touch={touch}
      avoidLauncher={hasAssistantLauncher}
    />
  ) : (
    <ComposerClosed isGuest={isGuest} />
  );
  const importDisabledReason = !signedIn
    ? "Signed-in reviewers only"
    : isImageReview
      ? "Video reviews only"
      : !allowComment
        ? "Commenting is closed"
        : null;
  const paneClass = "overflow-hidden max-lg:portrait:overflow-visible lg:ml-2 lg:min-h-0";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={rootRef}
        className={cn(
          "group/review flex min-w-0 flex-col gap-4",
          isMacDesktopApp ? "lg:h-[calc(100dvh-11.5rem)]" : "lg:h-[calc(100dvh-7.5rem)]"
        )}
        style={layout.rootStyle}
      >
        <ReviewHeader
          eyebrow={eyebrow}
          status={
            <>
              <StatusTag tone={status.tone}>{status.label}</StatusTag>
              {!isLatest ? <StatusTag tone="warning">Older version</StatusTag> : null}
              {guestToken ? (
                <StatusTag tone="neutral" icon={isGuest ? Eye : MessageSquare}>
                  {isGuest ? "View only" : "Can comment"}
                </StatusTag>
              ) : null}
            </>
          }
          title={title}
          versionControls={
            <>
              {versionSelect("md")}
              {goToLatest("md")}
            </>
          }
          description={helper ?? uploadedLine}
          descriptionOnPhone={!helper}
          approval={approvalStrip}
          tools={reviewToolButtons(toolProps)}
          decisions={decisionButtons}
          decisionsHint={helper}
        />

        {/* The static columns match the loading skeleton until the measured ones (splitStyle) arrive. */}
        <div
          ref={splitRef}
          className={cn(
            "flex min-w-0 flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_14px_minmax(320px,420px)] lg:gap-0",
            isMacDesktopApp && "lg:place-content-center"
          )}
          style={layout.splitStyle}
        >
          {/* Below 1024px this column dissolves so the player stays pinned past the end of it. */}
          <section aria-label="Player" className="min-w-0 max-lg:contents lg:min-h-0 lg:overflow-hidden lg:pr-2">
            <ReviewPlayer
              version={currentVersion}
              title={title}
              isImageReview={isImageReview}
              playback={playback}
              timelineDuration={timelineDuration}
              timeline={timeline}
              numbers={timelineNumbers}
              selectedCommentId={comments.selectedCommentId}
              allowComment={allowComment}
              composerPin={composerPin}
              mediaStageMaxWidthPx={layout.mediaStageMaxWidthPx}
              canUploadVersion={signedIn && canUploadVersion(data.workspaceRole)}
              refs={{ card: cardRef, stage: stageRef, controls: controlsRef, video: videoRef, canvas: canvasRef }}
              onCanvasClick={onCanvasClick}
              onFocusThread={(thread) => focusThread(thread, { scroll: true })}
              onCheckAgain={() => router.refresh()}
            />
            <ReviewPhoneToolbar versionSelect={versionSelect("touch")} goToLatest={goToLatest("touch")} tools={toolProps} />
            <ReviewDecisionCard approval={approvalStrip} helper={helper} decisions={decisionButtons} />
          </section>

          <ReviewSplitter
            controlsId={gradesInPanel ? GRADES_PANEL_ID : PANEL_ID}
            panelWidthPx={layout.panelWidthPx}
            isResizing={layout.isResizing}
            onPointerDown={layout.onSplitterPointerDown}
            onDoubleClick={layout.resetPanelWidth}
            onKeyDown={layout.onSplitterKeyDown}
          />

          <CommentsPanel
            id={PANEL_ID}
            className={cn(paneClass, gradesInPanel && "lg:hidden")}
            tab={activeTab}
            onTabChange={changeTab}
            showTranscriptTab={canUseFile}
            transcribing={transcripts.isTranscribing(currentVersionId)}
            transcriptReady={transcriptReadyFor === currentVersionId && activeTab !== "TRANSCRIPT"}
            filter={filter}
            onFilterChange={setFilter}
            timeline={timeline}
            general={general}
            timelineNumbers={timelineNumbers}
            generalNumbers={generalNumbers}
            newIds={newIds}
            newCount={newIds.size}
            onJumpToNew={jumpToNew}
            isImageReview={isImageReview}
            versionNumber={currentVersion?.versionNumber}
            allowComment={allowComment}
            state={comments}
            permissions={permissions}
            onFocusThread={(thread) => focusThread(thread)}
            onRequestDelete={(thread) => {
              setDeleteRequest({ id: thread.root.id, replyCount: thread.replies.length });
              setDeleteOpen(true);
            }}
            menu={{
              importDisabledReason,
              canExport: versionComments.length > 0,
              onImportFile: importCsv,
              onExport: exportCsv
            }}
            transcript={
              <ReviewTranscript
                versionId={currentVersionId}
                versionNumber={currentVersion?.versionNumber}
                transcripts={transcripts}
                onSeek={playback.seekTo}
              />
            }
            composer={composer}
          />
          {gradesInPanel ? (
            <QuickGradesPanel
              id={GRADES_PANEL_ID}
              state={quickGrades}
              projectName={data.projectName}
              peopleCount={data.assignedPeople.length}
              primary={!headerHasPrimary}
              className={cn(paneClass, "lg:col-start-3 lg:row-start-1")}
            />
          ) : null}
        </div>

        {quickGrades.enabled && !layout.isDesktopSplitLayout ? (
          <QuickGradesSheet state={quickGrades} projectName={data.projectName} peopleCount={data.assignedPeople.length} />
        ) : null}
        <ReviewDialogs
          decisions={decisions}
          deleteRequest={deleteRequest}
          deleteOpen={deleteOpen}
          onDeleteOpenChange={setDeleteOpen}
          onConfirmDelete={() => (deleteRequest ? comments.deleteThread(deleteRequest.id) : undefined)}
        />
      </div>
    </TooltipProvider>
  );
}
