"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCut } from "@/components/package-stages/clip-download";
import type { StageMediaCard } from "@/components/package-stages/types";
import { cn } from "@/src/lib/utils";

/** Saves this version of the Initial Cut or Final Cut (its original file). Hidden until the version is ready. */
export function CutDownloadButton({
  rowId,
  item,
  compact = false,
  className
}: {
  rowId: string;
  item: StageMediaCard;
  /** Ghost and small, for the earlier-version rows. */
  compact?: boolean;
  className?: string;
}) {
  const [starting, setStarting] = useState(false);
  const versionId = item.versionId;
  if (!versionId || item.status !== "READY") return null;
  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size={compact ? "sm" : "default"}
      className={cn("shrink-0 max-sm:h-10", className)}
      disabled={starting}
      aria-label={compact ? `Download version ${item.versionNumber}` : undefined}
      onClick={async () => {
        setStarting(true);
        try {
          await downloadCut(rowId, versionId);
        } finally {
          setStarting(false);
        }
      }}
    >
      <Download aria-hidden />
      Download
    </Button>
  );
}
