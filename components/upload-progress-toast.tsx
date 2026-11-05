"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ProgressBar } from "@/components/kit/progress";
import { CountBadge, StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";

export type UploadToastStatus = "QUEUED" | "PREPARING" | "UPLOADING" | "PROCESSING" | "DONE" | "FAILED";

export type UploadProgressToastItem = {
  id: string;
  fileName: string;
  status: UploadToastStatus;
  progress: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number | null;
  error?: string;
};

type UploadProgressToastProps = {
  items: UploadProgressToastItem[];
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatSpeed(speedBytesPerSecond: number) {
  if (!Number.isFinite(speedBytesPerSecond) || speedBytesPerSecond <= 0) {
    return "0 KB/s";
  }

  if (speedBytesPerSecond >= 1024 * 1024) {
    return `${(speedBytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  }

  if (speedBytesPerSecond >= 1024) {
    return `${(speedBytesPerSecond / 1024).toFixed(1)} KB/s`;
  }

  return `${Math.round(speedBytesPerSecond)} B/s`;
}

function formatEta(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined) {
    return "--";
  }

  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function statusLabel(status: UploadToastStatus) {
  if (status === "QUEUED") {
    return "Waiting";
  }
  if (status === "PREPARING") {
    return "Preparing";
  }
  if (status === "PROCESSING") {
    return "Processing";
  }
  if (status === "DONE") {
    return "Uploaded";
  }
  if (status === "FAILED") {
    return "Failed";
  }
  return "Uploading";
}

function statusTone(status: UploadToastStatus): StatusToneInput {
  if (status === "DONE") return "success";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function subscribeNever() {
  return () => undefined;
}

export function UploadProgressToast({ items }: UploadProgressToastProps) {
  // False on the server and during hydration (no document to portal into), true after.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  if (items.length === 0) {
    return null;
  }

  if (items.every((item) => item.status === "PROCESSING")) {
    return null;
  }

  const doneCount = items.filter((item) => item.status === "DONE").length;
  const failedCount = items.filter((item) => item.status === "FAILED").length;
  const activeCount = items.filter((item) => item.status === "PREPARING" || item.status === "UPLOADING").length;
  const averageProgress =
    items.reduce((total, item) => total + clampPercent(item.progress), 0) / Math.max(1, items.length);

  if (!mounted) {
    return null;
  }

  // Only the coarse counts are announced: the percentages, speeds and ETAs below change many
  // times a second and would flood a screen reader if the whole card were a live region.
  const announcement = `${doneCount} of ${items.length} uploaded${failedCount ? `, ${failedCount} failed` : ""}`;

  const toast = (
    <section
      aria-label="Uploads"
      className="fixed inset-x-4 bottom-[calc(var(--phone-tabbar-h,0px)+max(1.25rem,env(safe-area-inset-bottom))+3.5rem)] z-50 rounded-md border border-border bg-card p-4 sm:left-auto sm:right-[max(1.25rem,env(safe-area-inset-right))] sm:w-[360px]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Uploads in progress</p>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono-broadcast tabular-nums">
              {doneCount}/{items.length}
            </span>{" "}
            uploaded
            {failedCount ? ` · ${failedCount} failed` : ""}
            {activeCount ? ` · ${activeCount} active` : ""}
            {" · "}
            <span className="font-mono-broadcast tabular-nums">{Math.round(averageProgress)}%</span> overall
          </p>
        </div>
        <CountBadge count={items.length} tone="neutral" srLabel={`${items.length} uploads`} />
      </div>

      <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={item.fileName}>
                {item.fileName}
              </p>
              <StatusTag
                size="sm"
                tone={statusTone(item.status)}
                spinner={item.status === "PREPARING" || item.status === "UPLOADING" || item.status === "PROCESSING"}
              >
                {statusLabel(item.status)}
              </StatusTag>
            </div>
            <ProgressBar
              value={clampPercent(item.progress)}
              size="xs"
              tone={item.status === "FAILED" ? "danger" : "brand"}
              label={`${item.fileName} upload progress`}
              className="mt-2"
            />
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              <span className="font-mono-broadcast tabular-nums">{clampPercent(item.progress)}%</span>
              {item.status === "UPLOADING" ? (
                <span className="font-mono-broadcast tabular-nums">· {formatSpeed(item.speedBytesPerSecond ?? 0)}</span>
              ) : null}
              {item.status === "UPLOADING" ? (
                <span className="font-mono-broadcast tabular-nums">· ETA {formatEta(item.etaSeconds)}</span>
              ) : null}
              {item.status === "PROCESSING" ? <span>· Waiting for transcode</span> : null}
              {item.status === "FAILED" && item.error ? <span className="text-danger">· {item.error}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return createPortal(toast, document.body);
}
