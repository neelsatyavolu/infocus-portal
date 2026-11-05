"use client";

import { useEffect, type ReactNode } from "react";
import { History } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { MAX_PACKAGES_PER_SHOW } from "@/src/lib/publishing-queue";
import type { QueueRow } from "./queue-types";
import type { PastShowView } from "./queue-view-model";

export function pastRowAnchorId(rowId: string) {
  return `past-row-${rowId}`;
}

/**
 * Past shows (everyone): air dates that have passed and still hold packages, newest first.
 * Producers can still move, publish, download or remove from each row's menu; the Move and
 * Publish dialogs open on top of this one.
 */
export function PastShowsDialog({
  open,
  onOpenChange,
  canEdit,
  past,
  focusRowId,
  renderRow
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  past: PastShowView[];
  /** Scrolled into view on open (a failed upload or a published package from a summary tile). */
  focusRowId: string | null;
  renderRow: (row: QueueRow) => ReactNode;
}) {
  useEffect(() => {
    if (!open || !focusRowId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(pastRowAnchorId(focusRowId))?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, focusRowId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="border-b border-border px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>Past shows</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Shows whose air date has passed. You can still move, download, or remove packages."
              : "Shows whose air date has passed."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          {past.length === 0 ? (
            <EmptyState icon={History} title="No past shows yet." />
          ) : (
            <ol aria-label="Past shows" className="divide-y divide-border">
              {past.map((show) => {
                const full = show.rows.length >= MAX_PACKAGES_PER_SHOW;
                return (
                  <li key={show.date} className="space-y-2 py-4">
                    <div className="flex min-h-6 items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{show.label}</h3>
                      {full ? (
                        <StatusTag size="sm">Full</StatusTag>
                      ) : (
                        <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">
                          <span aria-hidden>
                            {show.rows.length}/{MAX_PACKAGES_PER_SHOW}
                          </span>
                          <span className="sr-only">
                            {show.rows.length} of {MAX_PACKAGES_PER_SHOW} packages
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">{show.rows.map((row) => renderRow(row))}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <DialogFooter className="border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
