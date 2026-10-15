"use client";

import { Clock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PARTICIPATION_POINTS_PER_WEEK } from "@/src/lib/grading";
import { cn } from "@/src/lib/utils";
import type { PendingItem } from "./participation-week";

/** `grid`: h-8 (h-10 on touch screens) for the desktop table. `touch`: h-10 with 16px text (no iOS zoom). */
export type CellSize = "grid" | "touch";

/**
 * One day's score. Status is never colour alone: a pending dock has an amber edge, a clock and
 * says who entered it; an unsaved edit has a dot in the corner; both are also in the field's name.
 */
export function ScoreInput({
  value,
  max,
  onChange,
  label,
  pending,
  unsaved,
  size
}: {
  value: number | undefined;
  max: number;
  onChange: (raw: string) => void;
  /** "Score for Abby on Tue". */
  label: string;
  pending?: PendingItem;
  unsaved: boolean;
  size: CellSize;
}) {
  const pendingBy = pending ? pending.requestedBy.name ?? pending.requestedBy.email : null;
  const title = pending
    ? `Waiting for another producer to approve${pendingBy ? ` · entered by ${pendingBy}` : ""}`
    : undefined;
  const states = [pending ? "waiting for approval" : null, unsaved ? "not saved yet" : null].filter(Boolean).join(", ");
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        aria-label={states ? `${label} (${states})` : label}
        title={title}
        className={cn(
          "rounded-md border bg-transparent px-1 text-center font-mono-broadcast tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // No spin buttons: they eat the narrow field and push the digits off-centre on hover.
          "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none",
          size === "touch" ? "h-10 w-16 text-base" : "h-8 w-14 text-sm pointer-coarse:h-10 pointer-coarse:text-base",
          pending ? "border-[var(--brand-amber)]" : "border-input"
        )}
      />
      {pending ? (
        <Clock
          aria-hidden
          className="pointer-events-none absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-card text-[var(--brand-amber)]"
        />
      ) : null}
      {unsaved ? (
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 h-2 w-2 rounded-full bg-foreground ring-2 ring-card" />
      ) : null}
    </span>
  );
}

/** Opens the comment for one cell. Filled when a comment exists; amber when it has no score to save with. */
export function CommentButton({
  hasNote,
  hasScore,
  max,
  studentName,
  dayLabel,
  onOpen,
  size
}: {
  hasNote: boolean;
  hasScore: boolean;
  max: number;
  studentName: string;
  dayLabel: string;
  onOpen: () => void;
  size: CellSize;
}) {
  const orphan = hasNote && !hasScore;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0",
        size === "touch" ? "h-10 w-10" : "h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10",
        orphan ? "text-[var(--brand-amber)]" : hasNote ? "text-foreground" : "text-muted-foreground"
      )}
      disabled={max <= 0 && !hasScore && !hasNote}
      aria-label={
        hasNote ? `Edit comment for ${studentName} on ${dayLabel}` : `Add comment for ${studentName} on ${dayLabel}`
      }
      title={orphan ? "This comment has no score yet, so it won't save" : undefined}
      onClick={onOpen}
    >
      <MessageSquare className={cn(hasNote && "fill-current")} aria-hidden />
    </Button>
  );
}

/** The schedule rule and what each cell mark means (status is never colour alone). */
export function ParticipationLegend({ offDays, className }: { offDays: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground", className)}>
      <p className="min-w-0">
        {PARTICIPATION_POINTS_PER_WEEK} points a week: 10 on Mondays (PA), 20 on Tue/Thu class; Wed/Fri shows and holidays
        off.
        {offDays.length > 0 ? ` Off this week: ${offDays.join(", ")}.` : ""}
      </p>
      <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:ml-auto">
        <li className="inline-flex items-center gap-1.5">
          <Clock aria-hidden className="h-3.5 w-3.5 text-[var(--brand-amber)]" />
          Waiting for approval
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-foreground" />
          Not saved yet
        </li>
        <li className="inline-flex items-center gap-1.5">
          <MessageSquare aria-hidden className="h-3.5 w-3.5 fill-current text-foreground" />
          Has a comment
        </li>
        <li className="inline-flex items-center gap-1.5">
          <MessageSquare aria-hidden className="h-3.5 w-3.5 fill-current text-[var(--brand-amber)]" />
          Comment needs a score
        </li>
      </ul>
    </div>
  );
}
