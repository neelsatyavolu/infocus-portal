"use client";

import { useRef } from "react";
import { ImageOff, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/icon-button";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import type { BrainstormProofView } from "@/src/lib/package-brainstorm";
import { useFileDrop } from "@/src/lib/use-file-drop";
import { cn } from "@/src/lib/utils";

/**
 * One proof-of-contact slot. Phones: a 64px row (thumbnail, label and file name, one action).
 * From sm: a tile (144px media, then a caption row), so empty and filled tiles are the same
 * height. Empty slots take a click or a dropped image; one upload runs at a time, so the other
 * slots are disabled while it does.
 */
export function ProofSlot({
  slot,
  proof,
  canEdit,
  uploading,
  busy,
  removeDisabled,
  onFile,
  onRemove
}: {
  slot: number;
  proof: BrainstormProofView | undefined;
  canEdit: boolean;
  /** This slot is uploading. */
  uploading: boolean;
  /** Any slot is uploading (one at a time, so results don't overwrite each other). */
  busy: boolean;
  /** A removal confirm is open. */
  removeDisabled: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const droppable = !proof && canEdit;
  const drop = useFileDrop({
    accept: "image/*",
    disabled: busy || !droppable,
    onDrop: ({ accepted, rejected }) => {
      if (accepted.length !== 1) {
        toast.error(accepted.length === 0 ? "Proofs of contact must be images." : "Drop one image per proof.");
        return;
      }
      if (rejected.length > 0) {
        toast.error(`Skipped ${rejected.length} file${rejected.length === 1 ? " that isn't an image" : "s that aren't images"}.`);
      }
      onFile(accepted[0]);
    }
  });
  const pick = () => inputRef.current?.click();
  // Another slot is uploading: this one waits, dimmed.
  const blocked = busy && !uploading;
  const zoneTone = drop.dragging
    ? "border-[var(--brand-green)] bg-[var(--brand-green)]/10 text-foreground"
    : "border-input text-muted-foreground";

  return (
    <div
      {...drop.bind}
      className="flex min-w-0 items-center gap-3 overflow-hidden rounded-md border border-border p-2 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
    >
      <div className="h-16 w-16 shrink-0 sm:h-36 sm:w-full">
        {proof ? (
          <a
            href={proof.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="block h-full w-full overflow-hidden rounded-md bg-[var(--ink-3)] focus-visible:outline-offset-[-2px] sm:rounded-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof.imageUrl} alt={proof.fileName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <>
            {/* Phones: a decorative box; the Upload button on the right is the action. */}
            <span
              aria-hidden
              className={cn(
                "grid h-full w-full place-items-center rounded-md border border-dashed sm:hidden",
                canEdit ? zoneTone : "border-border text-muted-foreground",
                blocked && "opacity-50"
              )}
            >
              {!canEdit ? <ImageOff className="h-4 w-4" /> : uploading ? <Spinner /> : <Upload className="h-4 w-4" />}
            </span>
            <div className="hidden h-full p-2 sm:block">
              {canEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={pick}
                  className={cn(
                    "flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed text-xs transition-colors hover:border-[var(--brand-green)]/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                    zoneTone,
                    blocked && "opacity-50"
                  )}
                >
                  {uploading ? <Spinner /> : <Upload className="h-4 w-4" aria-hidden />}
                  <span>
                    {uploading ? "Uploading…" : drop.dragging ? "Drop image" : "Upload or drop image"}
                    <span className="sr-only">{` for proof ${slot}`}</span>
                  </span>
                </button>
              ) : (
                <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                  No proof yet
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:h-11 sm:flex-none sm:border-t sm:border-border sm:pl-3 sm:pr-1">
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-2">
          <p className="shrink-0 text-[11px] font-medium uppercase leading-5 tracking-[0.11em] text-muted-foreground">Proof {slot}</p>
          <p
            title={proof?.fileName}
            className={cn(
              "min-w-0 truncate text-xs leading-5",
              proof ? "font-mono-broadcast text-[var(--ink-text)]" : "text-muted-foreground"
            )}
          >
            {proof ? (
              proof.fileName
            ) : canEdit ? (
              "Missing"
            ) : (
              // From sm the tile's media box already says so.
              <span className="sm:hidden">No proof yet</span>
            )}
          </p>
        </div>
        {droppable ? (
          <Button type="button" variant="outline" disabled={busy} onClick={pick} className="h-10 shrink-0 sm:hidden">
            {uploading ? <Spinner /> : <Upload aria-hidden />}
            {uploading ? "Uploading…" : "Upload"}
            <span className="sr-only">{` proof ${slot}`}</span>
          </Button>
        ) : null}
        {proof && canEdit ? (
          <IconButton label={`Remove proof ${slot}`} icon={X} size="touch" tone="danger" disabled={removeDisabled} onClick={onRemove} />
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
