"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { ProgressBar } from "@/components/kit/progress";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/grades/grade-badge";
import { pctOf } from "@/components/grades/grade-math";
import { LABEL_CLASS } from "@/components/grades/grade-parts";
import type { Totals } from "@/components/grades/grades-types";

export type WeightedCategory = {
  key: string;
  label: string;
  /** "55%" */
  weight: string;
  hint?: string;
  /** null while nothing is loaded. */
  score: Totals | null;
};

/**
 * The gradebook's summary rail on wide screens: the (what-if) grade, how each weighted category
 * moves as scores are typed, Reset what-if, and the typing legend. It sits beside the table and
 * stays in view while the table scrolls.
 */
export function WhatIfRail({
  loading,
  hasWhatIf,
  letter,
  percentage,
  official,
  categories,
  onReset,
  legend
}: {
  loading: boolean;
  hasWhatIf: boolean;
  letter: string | null | undefined;
  percentage: number | null | undefined;
  /** "Official B+ · 87.3%" while a what-if is showing. */
  official: ReactNode;
  categories: WeightedCategory[];
  onReset: () => void;
  legend: ReactNode;
}) {
  return (
    <aside aria-label="Grade summary" className="flex min-w-0 flex-col rounded-md border border-border bg-card text-card-foreground">
      <div className="space-y-2 p-5">
        {loading ? (
          <div aria-hidden className="space-y-2.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-12 w-14" />
            <Skeleton className="h-4 w-16" />
          </div>
        ) : (
          <GradeBadge letter={letter} percentage={percentage} label={hasWhatIf ? "What-if grade" : "Estimated grade"} />
        )}
        {hasWhatIf ? <p className="text-xs text-muted-foreground">{official}</p> : null}
      </div>

      <div className="border-t border-border p-5">
        <p className={LABEL_CLASS}>How it&apos;s weighted</p>
        <ul className="mt-3 space-y-3">
          {categories.map((category) => {
            const pct = category.score ? pctOf(category.score.earned, category.score.possible) : null;
            return (
              <li key={category.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {category.label}{" "}
                    <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">
                      <span className="sr-only">weight </span>
                      {category.weight}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono-broadcast text-sm tabular-nums text-foreground">
                    {pct === null ? <span className="text-muted-foreground">—</span> : `${pct}%`}
                  </span>
                </div>
                <ProgressBar value={pct} size="xs" label={`${category.label} percent`} className="mt-1.5" />
                {category.hint ? <p className="mt-1 text-xs leading-snug text-muted-foreground">{category.hint}</p> : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3 border-t border-border p-5">
        {/* Always rendered (disabled until something changes), so nothing shifts. */}
        <Button type="button" variant="outline" className="w-full" disabled={!hasWhatIf} onClick={onReset}>
          <RotateCcw aria-hidden />
          Reset what-if
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">{legend}</p>
      </div>
    </aside>
  );
}
