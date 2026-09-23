"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, MessageSquare, Play, RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CycleGradeReleaseCard } from "@/components/package-cycle/cycle-grade-release-card";
import { FinalCutGradeCard, type FinalCutGradeCardData } from "@/components/package-cycle/final-cut-grade-card";
import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import ProducerFeedbackDialog from "@/components/package-cycle/producer-feedback-dialog";
import { StageComments } from "@/components/package-cycle/stage-comments";
import { StageStatusChip } from "@/components/package-cycle/stage-status-chip";
import { UploadProgressToast, type UploadProgressToastItem } from "@/components/upload-progress-toast";
import { uploadFileToNas } from "@/src/lib/nas-upload-client";
import { holdUploadWakeLock } from "@/src/lib/upload-wake-lock";
import { createUploadSpeedTracker } from "@/src/lib/upload-speed";
import {
  APPROVE_ANYWAY_CONFIRM,
  approvalProgressLabel,
  approvalStagePillLabel,
  executiveWaitLabel
} from "@/src/lib/package-approval";
import {
  approvalStageToReviewStage,
  cutTileReviewStatus,
  groupTileStatusClass
} from "@/src/lib/group-tile-status";
import { STAGE_FEEDBACK_READ_EVENT } from "@/src/lib/package-stage-comments";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import { initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import { cycleStageStatus, type CycleStageStatus } from "@/src/lib/package-stage-status";
import { rollKindLabel, rollUploadSizeError, type RollKind } from "@/src/lib/package-roll-kind";
import { cn } from "@/src/lib/utils";

type MediaCard = {
  id: string;
  title: string;
  rollKind: RollKind | null;
  projectId: string | null;
  versionId: string | null;
  versionNumber: number;
  status: string;
  approvalStatus?: string;
  approvedInStage?: 1 | 2 | 3 | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  commentCount: number;
  isNew?: boolean;
};

type FinalCutGradePanel = FinalCutGradeCardData;

type StageView = {
  empty: boolean;
  slug: CycleStageSlug;
  isProducer: boolean;
  unlocked?: boolean;
  canUpload?: boolean;
  allowSecondFinalCut?: boolean;
  canComment?: boolean;
  canApproveAroll?: boolean;
  cutApproval?: { canAct: boolean; canUnapprove: boolean; canApproveAnyway?: boolean; stage: string } | null;
  canGradeFinalCut?: boolean;
  finalCutGrade?: FinalCutGradePanel | null;
  row?: {
    id: string;
    cycleNumber: number;
    groupTopic: string;
    proofOfContact: boolean;
    aRollBRoll: boolean;
    aRollNeedsChanges?: boolean;
    initialCut: boolean;
    awaitingRevisedInitialCut: boolean;
    initialCutNeedsRevisions?: boolean;
    queuedForAirAt: string | null;
    approvalStage: string;
    remainingExecutiveSignoffs?: number;
    members: Array<{ userId: string; name: string | null; email: string | null }>;
  };
  media?: MediaCard[];
};

const TITLES: Record<CycleStageSlug, string> = {
  "a-roll": "A-roll/B-roll",
  "initial-cut": "Initial Cut",
  "final-cut": "Final Cut"
};

async function fetchView(slug: CycleStageSlug, rowId?: string, reviewStage?: 1 | 2 | 3) {
  const query = new URLSearchParams({ stage: slug });
  if (rowId) query.set("rowId", rowId);
  if (reviewStage) query.set("reviewStage", String(reviewStage));
  const response = await fetch(`/api/package-cycle/stage?${query}`, { cache: "no-store" });
  const body = (await response.json()) as { data?: StageView; error?: { message?: string } };
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Failed to load stage.");
  }
  return body.data;
}

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
  const [view, setView] = useState<StageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadProgressToastItem[]>([]);
  const [awarded, setAwarded] = useState("");
  const [gradePreview, setGradePreview] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [publishingGrades, setPublishingGrades] = useState(false);
  const [pickRollOpen, setPickRollOpen] = useState(false);
  const [approveKind, setApproveKind] = useState<"aroll" | "cut" | null>(null);
  const [approving, setApproving] = useState(false);
  const [watching, setWatching] = useState<MediaCard | null>(null);
  const [showOlderCuts, setShowOlderCuts] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingRollKind = useRef<RollKind | null>(null);
  const speedTrackingRef = useRef(createUploadSpeedTracker());
  const progressFloorRef = useRef(0);

  function patchUploadItem(id: string, patch: Partial<UploadProgressToastItem>) {
    setUploadItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) setLoading(true);
    try {
      const next = await fetchView(slug, rowId, reviewStage);
      setView(next);
      if (next.finalCutGrade?.myPoints != null) {
        setAwarded(String(next.finalCutGrade.myPoints));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load.");
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, [slug, rowId, reviewStage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadOne(file: File, itemId: string) {
    if (slug === "a-roll" && pendingRollKind.current) {
      const sizeError = rollUploadSizeError(pendingRollKind.current, file.size);
      if (sizeError) throw new Error(sizeError);
    }
    if (!view?.row) {
      throw new Error("No package group.");
    }
    patchUploadItem(itemId, { status: "PREPARING", progress: 0, speedBytesPerSecond: 0, etaSeconds: null, error: undefined });
    speedTrackingRef.current.reset(performance.now());
    progressFloorRef.current = 0;
    const init = await fetch("/api/package-cycle/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        action: "init",
        rowId: view.row.id,
        stage: slug,
        title:
          slug === "initial-cut"
            ? initialCutVersionTitle(((view.media ?? [])[0]?.versionNumber ?? 0) + 1)
            : file.name.replace(/\.[^/.]+$/, "") || TITLES[slug],
        fileName: file.name,
        rollKind: pendingRollKind.current ?? undefined
      })
    });
    const initBody = (await init.json()) as {
      data?: { mediaId: string; versionId: string; upload: Parameters<typeof uploadFileToNas>[1] };
      error?: { message?: string };
    };
    if (!init.ok || !initBody.data) {
      throw new Error(initBody.error?.message ?? "Could not start upload.");
    }
    patchUploadItem(itemId, { status: "UPLOADING" });
    await uploadFileToNas(file, initBody.data.upload, (bytesUploaded, bytesTotal) => {
      if (!bytesTotal) return;
      const { speedBytesPerSecond, etaSeconds } = speedTrackingRef.current.sample(
        bytesUploaded,
        bytesTotal,
        performance.now()
      );
      const progress = Math.max(progressFloorRef.current, (bytesUploaded / bytesTotal) * 100);
      progressFloorRef.current = progress;
      patchUploadItem(itemId, {
        status: "UPLOADING",
        progress,
        speedBytesPerSecond,
        etaSeconds
      });
    });
    const complete = await fetch("/api/package-cycle/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        action: "complete",
        rowId: view.row.id,
        stage: slug,
        mediaId: initBody.data.mediaId,
        versionId: initBody.data.versionId
      })
    });
    if (!complete.ok) {
      const body = (await complete.json()) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? "Could not finish upload.");
    }
    const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
    void uploadNasPosterBestEffort(file, initBody.data.mediaId, initBody.data.versionId);
    patchUploadItem(itemId, { status: "DONE", progress: 100, speedBytesPerSecond: 0, etaSeconds: null });
  }

  async function uploadFiles(files: File[]) {
    if (!view?.row || files.length === 0) return;
    const items: UploadProgressToastItem[] = files.map((file, index) => ({
      id: `${file.name}-${file.size}-${index}`,
      fileName: file.name,
      status: "QUEUED",
      progress: 0
    }));
    setUploadItems(items);
    setUploading(true);
    let succeeded = 0;
    const failures: string[] = [];
    const releaseWakeLock = await holdUploadWakeLock();
    try {
      for (const [index, file] of files.entries()) {
        const itemId = items[index].id;
        try {
          await uploadOne(file, itemId);
          succeeded += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed.";
          failures.push(`${file.name}: ${message}`);
          patchUploadItem(itemId, { status: "FAILED", error: message });
        }
      }
      if (failures.length === 0) {
        toast.success(succeeded === 1 ? "Uploaded." : `Uploaded ${succeeded} videos.`);
        setUploadItems([]);
      } else if (succeeded === 0) {
        toast.error(failures[0] ?? "Upload failed.");
      } else {
        toast.error(`${succeeded} uploaded, ${failures.length} failed. ${failures[0]}`);
      }
      await load();
      window.dispatchEvent(new Event(STAGE_FEEDBACK_READ_EVENT));
    } finally {
      releaseWakeLock();
      setUploading(false);
    }
  }

  async function approveAroll(approved: boolean, feedback?: string) {
    if (!view?.row) return;
    setApproving(true);
    try {
      const response = await fetch("/api/package-cycle/stage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "approve-aroll",
          rowId: view.row.id,
          approved,
          feedback: approved ? feedback : undefined
        })
      });
      if (!response.ok) {
        toast.error("Could not update A-roll/B-roll.");
        return;
      }
      setApproveKind(null);
      toast.success(approved ? "A-roll/B-roll approved." : "A-roll/B-roll unmarked.");
      await load({ quiet: true });
    } finally {
      setApproving(false);
    }
  }

  async function approveCut(approved: boolean, feedback?: string, unapprove = false) {
    if (!view?.row) return;
    setApproving(true);
    try {
      const response = await fetch(`/api/package-progress/${view.row.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: unapprove ? "UNAPPROVE" : approved ? "DECIDE" : "SUBMIT_REVIEW",
          approved,
          note: approved ? feedback : undefined
        })
      });
      if (!response.ok) {
        toast.error("Could not update the review.");
        return;
      }
      setApproveKind(null);
      toast.success(unapprove ? "Approval withdrawn." : approved ? "Approval recorded." : "Review submitted — needs revisions.");
      await load({ quiet: true });
    } finally {
      setApproving(false);
    }
  }

  async function approveCutAnyway() {
    if (!view?.row) return;
    if (!window.confirm(APPROVE_ANYWAY_CONFIRM)) return;
    setApproving(true);
    try {
      const response = await fetch(`/api/package-progress/${view.row.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE_ANYWAY" })
      });
      if (!response.ok) {
        toast.error("Could not send the package to Stage 2.");
        return;
      }
      toast.success("Sent to Stage 2.");
      await load({ quiet: true });
    } finally {
      setApproving(false);
    }
  }

  async function saveGrade() {
    if (!view?.row) return;
    const awardedPoints = Number(awarded);
    const response = await fetch("/api/package-cycle/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: view.row.id, awardedPoints })
    });
    const body = (await response.json()) as {
      data?: {
        awardedPoints: number | null;
        officialPoints: number | null;
        daysLate: number;
        penaltyMultiplier: number;
        revisionCount?: number;
        secondRevisionCapped?: boolean;
        complete?: boolean;
        pendingCount?: number;
      };
      error?: { message?: string };
    };
    if (!response.ok || !body.data) {
      toast.error(body.error?.message ?? "Could not save grade.");
      return;
    }
    if (!body.data.complete || body.data.awardedPoints == null || body.data.officialPoints == null) {
      setGradePreview(
        body.data.pendingCount
          ? `Saved. Waiting on ${body.data.pendingCount} executive producer${body.data.pendingCount === 1 ? "" : "s"}.`
          : "Saved."
      );
      toast.success("Score saved.");
      await load();
      return;
    }
    const late =
      body.data.penaltyMultiplier > 0
        ? ` · ${Math.round(body.data.penaltyMultiplier * 100)}% late (${body.data.daysLate}d)`
        : "";
    const second =
      body.data.secondRevisionCapped || (body.data.revisionCount ?? 0) >= 2 ? " · second revision cap 75%" : "";
    setGradePreview(`Average ${body.data.awardedPoints} → official ${body.data.officialPoints}${late}${second}`);
    toast.success("Grade saved.");
    await load();
  }

  async function queue(queued: boolean) {
    if (!view?.row) return;
    const response = await fetch("/api/package-cycle/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: view.row.id, queued })
    });
    const payload = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      toast.error(payload.error?.message ?? "Could not update the publishing queue.");
      return;
    }
    toast.success(queued ? "Sent to publishing queue." : "Removed from queue.");
    await load();
  }

  async function saveCycleFeedback(feedback: string) {
    if (!view?.row) return;
    setSavingFeedback(true);
    try {
      const response = await fetch("/api/package-cycle/grade/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId: view.row.id, feedback })
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        toast.error(body.error?.message ?? "Could not save feedback.");
        return;
      }
      toast.success("Cycle grade feedback saved.");
      await load();
    } finally {
      setSavingFeedback(false);
    }
  }

  async function publishCycleGrades(feedback: string) {
    if (!view?.row) return;
    setPublishingGrades(true);
    try {
      const response = await fetch("/api/package-cycle/grade/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId: view.row.id, feedback })
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        toast.error(body.error?.message ?? "Could not publish grades.");
        return;
      }
      toast.success("Grades published. Students can see them on Grades.");
      await load();
    } finally {
      setPublishingGrades(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!view || view.empty) {
    return <div className="space-y-4">
      {!producerChrome && <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button><ProducerFeedbackDialog /></div>}
      <p className="text-sm text-muted-foreground">You are not on a package group this cycle.</p>
    </div>;
  }

  if (!view.unlocked && !view.isProducer) {
    return <p className="text-sm text-muted-foreground">This stage is locked until the previous one is approved.</p>;
  }

  const confirmFinal = slug === "final-cut";
  const mediaCount = (view.media ?? []).length;
  const remainingExecs = view.row?.remainingExecutiveSignoffs;
  const effectiveReviewStage = reviewStage ?? approvalStageToReviewStage(view.row?.approvalStage);
  const progressLabel =
    slug === "initial-cut"
      ? view.row?.awaitingRevisedInitialCut && !view.row.initialCutNeedsRevisions
        ? "Approved in Stage 1 · Awaiting revised upload"
        : approvalProgressLabel(view.row?.initialCutNeedsRevisions ? "DRAFT" : view.row?.approvalStage, remainingExecs)
      : null;
  const approvalPill = slug === "initial-cut" ? approvalStagePillLabel(view.row?.approvalStage) : null;
  const stageStatus: CycleStageStatus | null = view.row
    ? cycleStageStatus(
        slug,
        {
          proofOfContact: view.row.proofOfContact,
          proofCount: 0,
          brainstormDocUrl: "",
          aRollBRoll: view.row.aRollBRoll,
          aRollHasMedia: slug === "a-roll" && mediaCount > 0,
          aRollNeedsChanges: Boolean(view.row.aRollNeedsChanges),
          initialCut: view.row.initialCut,
          initialCutHasMedia: slug === "initial-cut" && mediaCount > 0,
          awaitingRevisedInitialCut: view.row.awaitingRevisedInitialCut,
          initialCutNeedsRevisions: Boolean(view.row.initialCutNeedsRevisions),
          approvalStage: view.row.approvalStage,
          finalCutHasMedia: slug === "final-cut" && mediaCount > 0,
          queuedForAir: Boolean(view.row.queuedForAirAt)
        },
        { showQueued: view.isProducer }
      )
    : null;

  const mediaItems = view.media ?? [];
  const visibleMedia = slug === "initial-cut" && !showOlderCuts ? mediaItems.slice(0, 2) : mediaItems;
  const olderCount = slug === "initial-cut" ? Math.max(0, mediaItems.length - 2) : 0;

  const headerPills = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!producerChrome && <>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
        <ProducerFeedbackDialog initialCycle={view.row?.cycleNumber} />
      </>}
      {view.row ? (
        <StageComments
          rowId={view.row.id}
          stage={slug}
          canWrite={Boolean(view.canComment)}
          onPosted={slug === "a-roll" ? () => void load({ quiet: true }) : undefined}
        />
      ) : null}
      {approvalPill && stageStatus !== "stage-2" && stageStatus !== "stage-3" && stageStatus !== "approved" ? (
        <span className="status-pill status-pill-lg status-neutral">{approvalPill}</span>
      ) : null}
      {stageStatus ? (
        <StageStatusChip
          status={stageStatus}
          size="lg"
          label={
            stageStatus === "stage-3" && remainingExecs != null
              ? (executiveWaitLabel(remainingExecs) ?? undefined)
              : undefined
          }
        />
      ) : null}
      {view.canApproveAroll ? (
        <Button type="button" onClick={() => setApproveKind("aroll")}>
          Approve A-roll/B-roll
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Current stage
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {TITLES[slug]}
              {reviewStage ? ` · Stage ${reviewStage}` : ""}
            </h2>
            {progressLabel ? <p className="mt-1 text-sm text-muted-foreground">{progressLabel}</p> : null}
          </div>
          {headerPills}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{producerChrome ? "Groups" : "Production"}</div>
            <h1 className="display-md mt-2 text-foreground">{TITLES[slug]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cycle {view.row?.cycleNumber}
              {view.row?.groupTopic ? ` · ${view.row.groupTopic}` : ""}
              {progressLabel ? ` · ${progressLabel}` : ""}
            </p>
          </div>
          {headerPills}
        </div>
      )}

      {view.canUpload ? (
        <div className="rounded-xl border border-border bg-card p-4">
          {confirmFinal && view.allowSecondFinalCut ? (
            <p className="mb-3 text-sm text-amber-200">
              Second revision: you can replace this Final Cut. The quality score is capped at 75%. Late turn-in is a
              separate 20%/30% penalty.
            </p>
          ) : confirmFinal ? (
            <p className="mb-3 text-sm text-amber-200">You can only upload Final Cut once unless the first grade is below 75%.</p>
          ) : null}
          {slug === "initial-cut" && (view.media ?? []).length > 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">Upload a new version of the same Initial Cut.</p>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            multiple={slug === "a-roll"}
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length === 0) return;
              if (
                confirmFinal &&
                !view.allowSecondFinalCut &&
                !window.confirm("Upload this Final Cut? You cannot replace it later unless the first grade is below 75%.")
              ) {
                return;
              }
              void uploadFiles(slug === "a-roll" ? files : files.slice(0, 1));
            }}
          />
          <Button
            type="button"
            disabled={uploading}
            onClick={() => {
              if (slug === "a-roll") {
                setPickRollOpen(true);
                return;
              }
              pendingRollKind.current = null;
              fileInput.current?.click();
            }}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {slug === "initial-cut" && (view.media ?? []).length > 0
              ? "Upload new version"
              : slug === "a-roll"
                ? "Upload videos"
                : "Upload"}
          </Button>
          {slug === "a-roll" ? (
            <p className="mt-2 text-xs text-muted-foreground">Choose A-roll or B-roll, then pick one or more clips. Maximum per file: A-roll 30 GB; B-roll 15 GB.</p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-3",
          slug === "a-roll"
            ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
            : producerChrome && slug === "final-cut"
              ? "grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.85fr)]"
              : "grid-cols-1 sm:grid-cols-2"
        )}
      >
        {visibleMedia.map((item) => {
          const reviewPath = item.projectId ? `/projects/${item.projectId}/review/${item.id}` : null;
          const isNew = slug === "a-roll" && view.isProducer && item.isNew;
          const reviewHref = reviewPath ? `${reviewPath}?bare=1` : null;
          const cutStatus = cutTileReviewStatus({
            approvalStatus: item.approvalStatus,
            reviewStage: effectiveReviewStage,
            approvedInStage: item.approvedInStage,
            remainingExecutiveSignoffs: remainingExecs
          });
          const tile = (
            <>
              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                {item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground">
                    <Play className="h-8 w-8" />
                  </div>
                )}
                {item.rollKind ? (
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {rollKindLabel(item.rollKind)}
                  </span>
                ) : null}
                {item.commentCount > 0 ? (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    <MessageSquare className="h-3 w-3" />
                    {item.commentCount}
                  </span>
                ) : null}
                {isNew ? (
                  <span
                    className="absolute bottom-2 left-2 rounded-md bg-amber-300 px-2 py-0.5 text-[11px] font-bold text-black"
                    title="Uploaded after the latest revision request"
                  >
                    NEW
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 px-3 py-2">
                <div className="space-y-1">
                  <div className="line-clamp-2 text-sm font-medium text-foreground">{item.title}</div>
                  {slug === "initial-cut" || slug === "final-cut" ? (
                    <span className={cn("status-pill status-pill-sm", groupTileStatusClass(cutStatus.tone))}>
                      {cutStatus.label}
                    </span>
                  ) : slug === "a-roll" && view.row?.aRollNeedsChanges ? (
                    <span className="status-pill status-pill-sm status-danger">Needs Changes</span>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">{item.status}</div>
                  )}
                </div>
                {slug === "initial-cut" && reviewHref ? (
                  <Link
                    href={reviewHref as never}
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full")}
                  >
                    Review
                  </Link>
                ) : null}
              </div>
            </>
          );
          const className = cn(
            "overflow-hidden rounded-xl border bg-card text-left",
            isNew ? "border-amber-300/70 ring-1 ring-amber-300/30 hover:border-amber-300" : "border-border hover:border-foreground/20"
          );
          const cardKey = item.versionId ?? item.id;
          if (slug === "a-roll") {
            return (
              <button key={cardKey} type="button" className={className} onClick={() => setWatching(item)}>
                {tile}
              </button>
            );
          }
          if (slug === "initial-cut") {
            return (
              <div key={cardKey} className={className}>
                {tile}
              </div>
            );
          }
          return reviewPath ? (
            <Link key={cardKey} href={reviewPath as never} className={className}>
              {tile}
            </Link>
          ) : (
            <div key={cardKey} className={className}>
              {tile}
            </div>
          );
        })}
        {producerChrome && slug === "final-cut" && view.finalCutGrade ? (
          <CycleGradeReleaseCard
            feedback={view.finalCutGrade.feedback}
            published={view.finalCutGrade.published}
            publishedAt={view.finalCutGrade.publishedAt}
            saving={savingFeedback}
            publishing={publishingGrades}
            onSave={(next) => void saveCycleFeedback(next)}
            onPublish={(next) => void publishCycleGrades(next)}
          />
        ) : null}
      </div>
      {olderCount > 0 ? (
        <Button type="button" variant="secondary" onClick={() => setShowOlderCuts((open) => !open)}>
          {showOlderCuts ? "Hide older versions" : `See older versions (${olderCount})`}
        </Button>
      ) : null}
      {mediaItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {reviewStage === 2
            ? "No Stage 2 cut yet. Approve Stage 1 first."
            : reviewStage === 3
              ? "No Stage 3 cut yet. Approve Stage 2 first."
              : "No videos uploaded yet."}
        </p>
      ) : null}

      <Dialog open={pickRollOpen} onOpenChange={setPickRollOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>A-roll or B-roll?</DialogTitle>
            <DialogDescription>This applies to every file you pick next.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(["a-roll", "b-roll"] as const).map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="secondary"
                onClick={() => {
                  pendingRollKind.current = kind;
                  setPickRollOpen(false);
                  window.setTimeout(() => fileInput.current?.click(), 0);
                }}
              >
                {rollKindLabel(kind)}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(watching)}
        onOpenChange={(open) => {
          if (!open) {
            setWatching(null);
            void load();
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{watching?.title ?? "Clip"}</DialogTitle>
            <DialogDescription>
              {watching?.rollKind ? rollKindLabel(watching.rollKind) : "A-roll/B-roll"}
            </DialogDescription>
          </DialogHeader>
          {watching?.playbackUrl ? (
            <video
              key={watching.id}
              src={watching.playbackUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-lg bg-black"
            />
          ) : (
            <p className="text-sm text-muted-foreground">This clip is not ready to play yet.</p>
          )}
          {view.row && watching ? (
            <StageComments
              rowId={view.row.id}
              stage={slug}
              canWrite={Boolean(view.canComment)}
              mediaItemId={watching.id}
              className="border-0 bg-transparent p-0"
              onPosted={slug === "a-roll" ? () => void load({ quiet: true }) : undefined}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {producerChrome && slug === "final-cut" && view.finalCutGrade ? (
        <FinalCutGradeCard
          grade={view.finalCutGrade}
          awarded={awarded}
          onAwardedChange={setAwarded}
          onSave={() => void saveGrade()}
          queued={Boolean(view.row?.queuedForAirAt)}
          onQueue={() => void queue(!view.row?.queuedForAirAt)}
          message={gradePreview}
        />
      ) : producerChrome && slug === "final-cut" ? (
        <p className="text-sm text-muted-foreground">Final Cut scoring is not available yet.</p>
      ) : null}

      {producerChrome && slug === "initial-cut" && view.row ? (
        <div className="space-y-2">
          {progressLabel ? <p className="text-sm text-muted-foreground">{progressLabel}</p> : null}
        <div className="flex flex-wrap gap-2">
          {view.cutApproval?.canAct && (!reviewStage || reviewStage === approvalStageToReviewStage(view.cutApproval.stage)) ? (
            <>
              <Button type="button" variant="secondary" disabled={approving} onClick={() => void approveCut(false)}>
                Submit review (needs revisions)
              </Button>
              <Button type="button" disabled={approving} onClick={() => setApproveKind("cut")}>
                {view.row.initialCutNeedsRevisions ? "Approve anyway" : "Approve"}
              </Button>
            </>
          ) : null}
          {view.cutApproval?.canUnapprove ? (
            <Button type="button" variant="secondary" disabled={approving} onClick={() => void approveCut(false, undefined, true)}>
              Unapprove
            </Button>
          ) : null}
          {view.cutApproval?.canApproveAnyway ? (
            <Button type="button" disabled={approving} onClick={() => void approveCutAnyway()}>
              Approve anyway
            </Button>
          ) : null}
        </div>
        </div>
      ) : null}

      <ApproveFeedbackDialog
        open={Boolean(approveKind)}
        saving={approving}
        onOpenChange={(open) => {
          if (!open) setApproveKind(null);
        }}
        onConfirm={(feedback) => {
          if (approveKind === "aroll") {
            void approveAroll(true, feedback);
            return;
          }
          if (approveKind === "cut") {
            void approveCut(true, feedback);
          }
        }}
      />
      <UploadProgressToast items={uploadItems} />
    </div>
  );
}
