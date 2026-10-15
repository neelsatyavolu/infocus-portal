"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { UploadProgressToastItem } from "@/components/upload-progress-toast";
import { STAGE_TITLES, type StageView } from "@/components/package-stages/types";
import { uploadFileToNas } from "@/src/lib/nas-upload-client";
import { initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import { rollUploadSizeError, type RollKind } from "@/src/lib/package-roll-kind";
import { STAGE_FEEDBACK_READ_EVENT } from "@/src/lib/package-stage-comments";
import { createUploadSpeedTracker } from "@/src/lib/upload-speed";
import { holdUploadWakeLock } from "@/src/lib/upload-wake-lock";
import { useFileDrop } from "@/src/lib/use-file-drop";

type InitResponse = {
  data?: { mediaId: string; versionId: string; upload: Parameters<typeof uploadFileToNas>[1] };
  error?: { message?: string };
};

/**
 * Everything a stage upload needs: the Upload button's routing (A-roll asks A-roll or B-roll,
 * Final Cut asks for the headline and toss, Initial Cut opens the file picker), drag and drop,
 * the Final Cut "can't replace it" confirm, the sequential NAS upload with progress, speed and
 * ETA, the wake lock, and the quiet reload + STAGE_FEEDBACK_READ_EVENT afterwards.
 */
export function useStageUpload({
  slug,
  view,
  reload
}: {
  slug: CycleStageSlug;
  view: StageView | null;
  reload: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadProgressToastItem[]>([]);
  const [pickRollOpen, setPickRollOpen] = useState(false);
  const [headlineOpen, setHeadlineOpen] = useState(false);
  // Files dropped on the media panel, held while the A-roll/B-roll or headline dialog is open.
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);
  // Final Cut file waiting on the "you can't replace it" confirm.
  const [finalCutConfirmFiles, setFinalCutConfirmFiles] = useState<File[] | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pendingRollKind = useRef<RollKind | null>(null);
  const pendingHeadline = useRef("");
  const pendingToss = useRef("");
  const speedTrackingRef = useRef(createUploadSpeedTracker());
  const progressFloorRef = useRef(0);

  function patchUploadItem(id: string, patch: Partial<UploadProgressToastItem>) {
    setUploadItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function uploadTitle(file: File) {
    if (slug === "initial-cut") return initialCutVersionTitle(((view?.media ?? [])[0]?.versionNumber ?? 0) + 1);
    if (slug === "final-cut") return pendingHeadline.current;
    return file.name.replace(/\.[^/.]+$/, "") || STAGE_TITLES[slug];
  }

  async function uploadOne(file: File, itemId: string) {
    if (slug === "a-roll" && pendingRollKind.current) {
      const sizeError = rollUploadSizeError(pendingRollKind.current, file.size);
      if (sizeError) throw new Error(sizeError);
    }
    const row = view?.row;
    if (!row) {
      throw new Error("No package group.");
    }
    patchUploadItem(itemId, {
      status: "PREPARING",
      progress: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null,
      error: undefined
    });
    speedTrackingRef.current.reset(performance.now());
    progressFloorRef.current = 0;
    const init = await fetch("/api/package-cycle/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        action: "init",
        rowId: row.id,
        stage: slug,
        title: uploadTitle(file),
        fileName: file.name,
        rollKind: pendingRollKind.current ?? undefined,
        toss: slug === "final-cut" ? pendingToss.current : undefined
      })
    });
    const initBody = (await init.json()) as InitResponse;
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
      patchUploadItem(itemId, { status: "UPLOADING", progress, speedBytesPerSecond, etaSeconds });
    });
    const complete = await fetch("/api/package-cycle/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        action: "complete",
        rowId: row.id,
        stage: slug,
        mediaId: initBody.data.mediaId,
        versionId: initBody.data.versionId,
        toss: slug === "final-cut" ? pendingToss.current : undefined
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
      await reload();
      window.dispatchEvent(new Event(STAGE_FEEDBACK_READ_EVENT));
    } finally {
      releaseWakeLock();
      setUploading(false);
    }
  }

  function startUpload(files: File[]) {
    if (files.length === 0) return;
    if (slug === "final-cut" && !view?.allowSecondFinalCut) {
      setFinalCutConfirmFiles(files.slice(0, 1));
      return;
    }
    void uploadFiles(slug === "a-roll" ? files : files.slice(0, 1));
  }

  /** Uploads files dropped before a dialog opened; returns false when the file picker should open instead. */
  function uploadDroppedFiles() {
    if (!droppedFiles) return false;
    setDroppedFiles(null);
    startUpload(droppedFiles);
    return true;
  }

  /** Opens the picker after a dialog closes (a tick later, so the browser still counts the click). */
  function openPickerSoon() {
    window.setTimeout(() => fileInput.current?.click(), 0);
  }

  const fileDrop = useFileDrop({
    accept: "video/*",
    disabled: uploading || !view?.canUpload,
    onDrop: ({ accepted, rejected }) => {
      if (accepted.length === 0) {
        toast.error("Only video files can be uploaded here.");
        return;
      }
      if (slug !== "a-roll" && accepted.length > 1) {
        toast.error("Drop one video at a time.");
        return;
      }
      if (rejected.length > 0) {
        toast.error(
          `Skipped ${rejected.length} file${rejected.length === 1 ? " that isn't a video" : "s that aren't videos"}.`
        );
      }
      if (slug === "a-roll") {
        setDroppedFiles(accepted);
        setPickRollOpen(true);
        return;
      }
      if (slug === "final-cut") {
        setDroppedFiles(accepted);
        setHeadlineOpen(true);
        return;
      }
      pendingRollKind.current = null;
      startUpload(accepted);
    }
  });

  /** The header's Upload button: same routing as a drop, but ends at the file picker. */
  function openUpload() {
    if (slug === "a-roll") {
      setPickRollOpen(true);
      return;
    }
    if (slug === "final-cut") {
      setHeadlineOpen(true);
      return;
    }
    pendingRollKind.current = null;
    fileInput.current?.click();
  }

  return {
    uploading,
    uploadItems,
    fileDrop,
    openUpload,
    fileInputProps: {
      ref: fileInput,
      type: "file" as const,
      accept: "video/*",
      multiple: slug === "a-roll",
      className: "hidden",
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        startUpload(files);
      }
    },
    rollDialog: {
      open: pickRollOpen,
      droppedCount: droppedFiles?.length ?? null,
      onOpenChange: (open: boolean) => {
        setPickRollOpen(open);
        if (!open) setDroppedFiles(null);
      },
      onPick: (kind: RollKind) => {
        pendingRollKind.current = kind;
        setPickRollOpen(false);
        if (uploadDroppedFiles()) return;
        openPickerSoon();
      }
    },
    headlineDialog: {
      open: headlineOpen,
      hasVideo: Boolean(droppedFiles),
      onOpenChange: (open: boolean) => {
        setHeadlineOpen(open);
        if (!open) setDroppedFiles(null);
      },
      onContinue: ({ headline, toss }: { headline: string; toss: string }) => {
        pendingHeadline.current = headline;
        pendingToss.current = toss;
        pendingRollKind.current = null;
        setHeadlineOpen(false);
        if (uploadDroppedFiles()) return;
        openPickerSoon();
      }
    },
    finalCutConfirm: {
      open: finalCutConfirmFiles !== null,
      headline: pendingHeadline.current,
      onOpenChange: (open: boolean) => {
        if (!open) setFinalCutConfirmFiles(null);
      },
      onConfirm: () => {
        if (finalCutConfirmFiles) void uploadFiles(finalCutConfirmFiles);
      }
    }
  };
}
