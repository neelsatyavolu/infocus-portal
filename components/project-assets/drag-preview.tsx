"use client";

import type { RefObject } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Folder } from "lucide-react";
import { shouldBypassNextImageOptimization } from "@/components/project-assets/format";
import type { DragPreviewState } from "@/components/project-assets/types";

/**
 * The card that follows the pointer while an asset is dragged onto a folder. The parent moves
 * it through `overlayRef` (transform) so dragging never re-renders the grid.
 */
export default function DragPreview({
  preview,
  targetFolderName,
  overlayRef
}: {
  preview: DragPreviewState;
  targetFolderName: string | null;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[220]">
      <div
        ref={overlayRef}
        className="w-[min(320px,calc(100vw-1.5rem))] rounded-md border border-border bg-card p-2"
        style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
      >
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-sm bg-black">
            {preview.thumbnailUrl ? (
              <Image
                src={preview.thumbnailUrl}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
                unoptimized={shouldBypassNextImageOptimization(preview.thumbnailUrl)}
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-[var(--soft-white)]/60">
                <Folder className="h-4 w-4" aria-hidden />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Move asset</p>
            <p className="truncate text-sm font-semibold text-foreground">{preview.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {preview.itemCount > 1 ? `${preview.itemCount} selected items` : "1 item"}
              {targetFolderName ? ` → ${targetFolderName}` : " → Drop on a folder"}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
