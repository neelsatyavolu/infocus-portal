"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

function CircleProgress({ progress }: { progress: number }) {
  const percentage = clampPercent(progress);
  const degrees = Math.max(2, percentage * 3.6);

  return (
    <div
      className="grid h-9 w-9 place-items-center rounded-full p-[2px]"
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${degrees}deg, hsl(var(--secondary)) 0deg)`
      }}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-background font-mono text-[10px] font-semibold tabular-nums text-foreground">
        {percentage}
      </div>
    </div>
  );
}

export function UploadProgressToast({ items }: UploadProgressToastProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const toast = (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] rounded-2xl border border-border bg-card p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Uploads in progress</p>
          <p className="text-xs text-muted-foreground">
            {doneCount}/{items.length} uploaded
            {failedCount ? ` · ${failedCount} failed` : ""}
            {activeCount ? ` · ${activeCount} active` : ""}
            {" · "}
            {Math.round(averageProgress)}% overall
          </p>
        </div>
        <span className="rounded-md border border-border bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
          {items.length}
        </span>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted p-2.5">
            <CircleProgress progress={item.progress} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-medium text-foreground">{item.fileName}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{statusLabel(item.status)}</span>
                {item.status === "UPLOADING" ? <span>• {formatSpeed(item.speedBytesPerSecond ?? 0)}</span> : null}
                {item.status === "UPLOADING" ? <span>• ETA {formatEta(item.etaSeconds)}</span> : null}
                {item.status === "PROCESSING" ? <span>• Waiting for transcode</span> : null}
                {item.status === "FAILED" && item.error ? <span>• {item.error}</span> : null}
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary">
                <div
                  className="h-1.5 rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${clampPercent(item.progress)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(toast, document.body);
}
