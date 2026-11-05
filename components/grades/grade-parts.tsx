"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import { ProgressBar } from "@/components/kit/progress";
import { StatusTag } from "@/components/kit/status-tag";
import { pctOf } from "@/components/grades/grade-math";
import type { Totals } from "@/components/grades/grades-types";
import { formatPoints } from "@/components/grades/what-if";
import { CHECK_IN_STAGES, PACKAGE_STAGE_LABELS, type CheckInStage } from "@/src/lib/package-stages";
import type { GradebookCheckIn } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

/** The 11px caps label used for every small heading on this screen. */
export const LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

/** Student-facing stage names (the package stage bar's), shortened to fit a tag. */
const STAGE_SHORT: Record<CheckInStage, string> = {
  pitching: "Pitch",
  proofOfContact: "Brainstorm",
  aRollBRoll: "A/B-roll",
  initialCut: "Initial"
};

/** "Changed since your last visit." */
export function NewTag() {
  return (
    <StatusTag tone="success" dot title="Changed since your last visit">
      New
    </StatusTag>
  );
}

/**
 * One grade category in the Overview band: caps label with its mono weight beside it ("55%"; data,
 * not a tag; left out for a grouping that isn't a weighted category), mono total, percent, a
 * one-line hint, bar.
 */
export function CategoryMeter({
  label,
  weight,
  totals,
  hint,
  className
}: {
  label: string;
  /** "55%"; omit for a grouping with no weight of its own. */
  weight?: string;
  /** null or possible 0 shows "—" (nothing gradeable yet). */
  totals: Totals | null;
  hint: ReactNode;
  className?: string;
}) {
  const gradeable = totals !== null && totals.possible > 0;
  const pct = gradeable ? pctOf(totals.earned, totals.possible) : null;
  return (
    <div
      className={cn(
        // Phones: one compact row (label + tag | value), then the text and the bar.
        "grid h-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5",
        "sm:grid-cols-1 sm:grid-rows-[auto_auto_auto_minmax(0,1fr)] sm:items-start",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 sm:justify-between">
        <h3 className={cn(LABEL_CLASS, "truncate")}>{label}</h3>
        {weight ? (
          <span className="shrink-0 font-mono-broadcast text-xs leading-tight tabular-nums text-muted-foreground">
            <span className="sr-only">Weight </span>
            {weight}
          </span>
        ) : null}
      </div>
      <p className="text-right font-mono-broadcast text-lg font-medium leading-tight tabular-nums text-foreground sm:text-left sm:text-2xl">
        {gradeable ? (
          <>
            {formatPoints(totals.earned)}
            <span className="text-sm text-muted-foreground sm:text-base"> / {formatPoints(totals.possible)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>
      <p className="col-span-2 flex min-w-0 flex-wrap gap-x-1.5 text-xs leading-snug text-muted-foreground sm:col-span-1 sm:flex-col sm:flex-nowrap">
        <span>{pct === null ? "Not gradeable yet" : `${pct}% of category`}</span>
        <span aria-hidden className="sm:hidden">
          ·
        </span>
        {/* Hints are kept to about 32 characters so every cell stays one line here; it wraps rather than truncating. */}
        <span className="min-w-0">{hint}</span>
      </p>
      {/* An empty track when nothing is graded keeps every cell the same height. */}
      <ProgressBar value={pct} label={`${label} percent`} className="col-span-2 self-end pt-1 sm:col-span-1 sm:pt-2" />
    </div>
  );
}

/** Caps label over a mono "value / max" (Final cut, Check-ins). */
export function ScoreStat({
  label,
  value,
  max,
  className
}: {
  label: string;
  value: number | null;
  max: number;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className={LABEL_CLASS}>{label}</p>
      <p className="mt-1 font-mono-broadcast text-base leading-tight tabular-nums">
        <span className={value === null ? "text-muted-foreground" : "text-foreground"}>{value ?? "—"}</span>
        <span className="text-muted-foreground"> / {max}</span>
      </p>
    </div>
  );
}

/**
 * The four check-in stages as tags. Done = success tag with a check; not done = quiet tag with
 * an empty circle, plus the full name and state for screen readers (never color alone). A cycle
 * with no check-in row shows every stage as not done.
 */
export function StageTags({ stages, className }: { stages: GradebookCheckIn | undefined; className?: string }) {
  return (
    <ul aria-label="Check-in stages" className={cn("grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap", className)}>
      {CHECK_IN_STAGES.map((stage) => {
        const done = Boolean(stages?.[stage]);
        const state = `${PACKAGE_STAGE_LABELS[stage]}: ${done ? "done" : "not done"}`;
        return (
          <li key={stage} className="flex min-w-0">
            <StatusTag size="sm" tone={done ? "success" : "muted"} icon={done ? Check : Circle} title={state}>
              <span aria-hidden>{STAGE_SHORT[stage]}</span>
              <span className="sr-only">{state}</span>
            </StatusTag>
          </li>
        );
      })}
    </ul>
  );
}

const CLAMP: Record<3 | 4, string> = { 3: "line-clamp-3", 4: "line-clamp-4" };

/** Pre-wrap text clamped to a few lines, with "Show more" only when it actually overflows. */
export function ClampText({ text, lines = 3, className }: { text: string; lines?: 3 | 4; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || open) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, open, lines]);

  return (
    <div className={cn("min-w-0", className)}>
      <p ref={ref} className={cn("whitespace-pre-wrap break-words", !open && CLAMP[lines])}>
        {text}
      </p>
      {overflows || open ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-0.5 inline-flex h-10 items-center rounded-sm sm:h-8 text-xs font-medium text-[var(--brand-green)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
