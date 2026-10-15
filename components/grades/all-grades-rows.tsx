"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ProgressBar } from "@/components/kit/progress";
import { Skeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { LABEL_CLASS } from "@/components/grades/grade-parts";
import type { GradeItem } from "@/components/grades/what-if";
import { gradeScoreInput, parseGradeScore, type GradeScore } from "@/src/lib/grade-score";
import { cn } from "@/src/lib/utils";

/**
 * One grid for every gradebook row (header, groups, items), so each number sits in its column:
 * ITEM | SCORE | OUT OF | STATUS. On phones STATUS moves under the item name.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_4rem_3rem] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_5rem]";
const ROW_PAD = "px-4 md:px-5";
/**
 * Items line up under their category's title: the category's own indent + the 16px chevron +
 * the 8px gap (12 + 16 + 8 = 36px on phones, 16 + 16 + 8 = 40px from sm).
 */
const ITEM_INDENT = "pl-9 sm:pl-10";

export function GradebookHeader() {
  return (
    <div aria-hidden className={cn(ROW_GRID, ROW_PAD, LABEL_CLASS, "h-9 border-b border-border")}>
      <span>Item</span>
      <span className="text-right">Score</span>
      <span className="whitespace-nowrap">Out of</span>
      <span className="hidden sm:block">Status</span>
    </div>
  );
}

/** A collapsible group (semester or category): chevron + title, its subtotal, and a thin bar. */
export function GradeGroupRow({
  depth,
  open,
  onToggle,
  title,
  score,
  outOf,
  bar
}: {
  depth: 0 | 1;
  open: boolean;
  onToggle: () => void;
  title: string;
  /** Under SCORE: earned points, or the semester percent. */
  score: string;
  /** Under OUT OF: "/ possible" (none for the semester row). */
  outOf?: string;
  bar: number | null;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        ROW_GRID,
        ROW_PAD,
        // A faint tint on hover (not Ink 3), so the bar's empty track stays visible.
        "min-h-11 w-full border-b border-border py-2 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      )}
    >
      <span className={cn("flex min-w-0 items-center gap-2", depth === 1 && "pl-3 sm:pl-4")}>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
        <span className="min-w-0 break-words text-sm font-semibold text-foreground">{title}</span>
        {/* Phones have no STATUS column, so the bar sits at the end of the title cell. */}
        <span aria-hidden className="ml-auto w-10 shrink-0 sm:hidden">
          <ProgressBar value={bar} size="xs" label={`${title} percent`} />
        </span>
      </span>
      {/* pr matches the score box's padding, so subtotals sit right under the scores. */}
      <span className="pr-2.5 text-right font-mono-broadcast text-sm tabular-nums text-foreground">{score}</span>
      <span className="font-mono-broadcast text-sm tabular-nums text-muted-foreground">{outOf}</span>
      <span aria-hidden className="hidden sm:block">
        <ProgressBar value={bar} size="xs" label={`${title} percent`} />
      </span>
    </button>
  );
}

function statusOf(value: GradeScore, dirty: boolean): ReactNode {
  if (value === "EXEMPT") return <StatusTag size="sm">Exempt</StatusTag>;
  if (value === "UNGRADED") return <StatusTag size="sm" tone="muted">Ungraded</StatusTag>;
  if (value === null) return null;
  if (dirty) return <StatusTag size="sm" tone="success">What-if</StatusTag>;
  return null;
}

/**
 * One scored item with its what-if box. Typing: a number (rounded, capped at max), "-" for
 * ungraded, "\" for exempt; clearing restores the official score. Enter moves to the next box
 * (Shift+Enter to the previous one).
 */
export function GradeItemRow({
  name,
  sub,
  official,
  max,
  value,
  onChange,
  onMove
}: GradeItem & { onMove: (from: HTMLInputElement, step: 1 | -1) => void }) {
  const inputId = useId();
  const dirty = value !== official;
  // The sub line is part of the name for screen readers ("Livestream (6/8 hours completed)").
  const fullName = sub ? `${name} (${sub})` : name;
  const status = statusOf(value, dirty);
  return (
    <div className={cn(ROW_GRID, ROW_PAD, "min-h-12 border-b border-border/60 py-2")}>
      <div className={cn("min-w-0", ITEM_INDENT)}>
        <label htmlFor={inputId} className="block break-words text-sm leading-snug text-foreground">
          {name}
        </label>
        {sub ? <p className="text-xs leading-snug text-muted-foreground">{sub}</p> : null}
        {status ? <div className="mt-1 sm:hidden">{status}</div> : null}
      </div>
      <input
        id={inputId}
        data-grade-score=""
        type="text"
        aria-label={`${fullName} what-if score`}
        title="Enter points, - for ungraded, or \ for exempt. Clear to restore the official score."
        value={gradeScoreInput(value)}
        placeholder={value === null ? "N/A" : "—"}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const parsed = parseGradeScore(raw, max);
          if (parsed !== undefined) onChange(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onMove(event.currentTarget, event.shiftKey ? -1 : 1);
        }}
        className={cn(
          // 40px and 16px text on phones (touch, no iOS zoom); a real field border at rest, green once changed.
          "h-10 w-full min-w-0 rounded-md border bg-transparent px-2 text-right font-mono-broadcast text-base tabular-nums transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:text-sm",
          dirty
            ? "border-[var(--brand-green)] text-[var(--brand-green)]"
            : "border-input text-foreground hover:border-foreground/60"
        )}
      />
      <label htmlFor={inputId} className="font-mono-broadcast text-sm tabular-nums text-muted-foreground">
        / {max}
      </label>
      <div className="hidden min-w-0 sm:flex">{status}</div>
    </div>
  );
}

/** "No weeks yet." inside an open group. */
export function GradeGroupEmpty({ children }: { children: ReactNode }) {
  return <p className={cn(ROW_PAD, ITEM_INDENT, "border-b border-border/60 py-3 text-sm text-muted-foreground")}>{children}</p>;
}

export function GradebookSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading gradebook…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden className={cn(ROW_GRID, ROW_PAD, "min-h-12 border-b border-border/60 py-2")}>
          <span className={cn("min-w-0", index % 4 === 0 ? "" : ITEM_INDENT)}>
            <Skeleton className={cn("h-3.5", index % 3 === 1 ? "w-1/2" : "w-2/3")} />
          </span>
          <Skeleton className="h-10 w-full rounded-md sm:h-8" />
          <Skeleton className="h-3.5 w-8" />
          <span className="hidden sm:block">
            <Skeleton className="h-1 w-full rounded-full" />
          </span>
        </div>
      ))}
    </div>
  );
}
