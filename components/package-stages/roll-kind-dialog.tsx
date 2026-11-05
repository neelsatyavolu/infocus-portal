"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rollKindLabel, type RollKind } from "@/src/lib/package-roll-kind";

const CHOICES: Array<{ kind: RollKind; detail: string }> = [
  { kind: "a-roll", detail: "Up to 30 GB per file" },
  { kind: "b-roll", detail: "Up to 15 GB per file" }
];

/**
 * "A-roll or B-roll?" before an A-roll/B-roll upload: two large choice tiles that carry each
 * kind's per-file size limit. Picking one uploads the dropped files or opens the file picker.
 */
export function RollKindDialog({
  open,
  droppedCount,
  onOpenChange,
  onPick
}: {
  open: boolean;
  /** Files already dropped (null when the picker opens next). */
  droppedCount: number | null;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: RollKind) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>A-roll or B-roll?</DialogTitle>
          <DialogDescription>
            {droppedCount
              ? `This applies to the ${droppedCount === 1 ? "file" : `${droppedCount} files`} you dropped.`
              : "This applies to every file you pick next."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {CHOICES.map(({ kind, detail }) => (
            <button
              key={kind}
              type="button"
              onClick={() => onPick(kind)}
              className="flex h-20 min-w-0 flex-col items-start justify-center gap-1 rounded-md border border-input px-4 text-left transition-colors hover:border-[var(--brand-green)] hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-base font-semibold text-foreground">{rollKindLabel(kind)}</span>
              <span className="text-[13px] text-muted-foreground">{detail}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
