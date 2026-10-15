"use client";

import type { ReactNode } from "react";
import { Panel } from "@/components/kit/panel";
import { ProgressBar } from "@/components/kit/progress";
import { ClampText, LABEL_CLASS, NewTag } from "@/components/grades/grade-parts";
import { formatHours, weightLabel } from "@/components/grades/grade-math";
import { OTHER_BODY_CLASS, OTHER_LIVESTREAM_CLASS, OTHER_PORTFOLIO_CLASS } from "@/components/grades/grades-layout";
import { LIVESTREAM_SEEN_KEY, PORTFOLIO_SEEN_KEY } from "@/components/grades/grades-seen";
import {
  GRADE_WEIGHTS,
  MAX_LIVESTREAM_POINTS,
  MAX_PORTFOLIO_POINTS,
  POINTS_PER_LIVESTREAM_HOUR
} from "@/src/lib/grading";
import { cn } from "@/src/lib/utils";

/**
 * Livestream credit and the end-of-semester portfolio, in one card (the old Other tab): stacked on
 * phones, side by side from md. The band above already shows their combined total, so each part
 * leads with its own details and keeps its points on the label row.
 */
export function GradesOther({
  livestreamPoints,
  livestreamHours,
  requiredHours,
  portfolioPoints,
  portfolioFeedback,
  newKeys,
  className
}: {
  livestreamPoints: number | null;
  livestreamHours: number;
  requiredHours: number;
  portfolioPoints: number | null;
  portfolioFeedback: string;
  newKeys: ReadonlySet<string>;
  /** Grid placement from the Overview (grades-layout.ts). */
  className?: string;
}) {
  const hours = formatHours(livestreamHours);
  const required = formatHours(requiredHours);
  const portfolioWeight = weightLabel(GRADE_WEIGHTS.portfolio);
  const packagesWeight = weightLabel(GRADE_WEIGHTS.packages);
  return (
    <Panel
      id="grades-other"
      title="Livestream & portfolio"
      titleAs="h2"
      className={cn("scroll-mt-20", className)}
      bodyClassName={OTHER_BODY_CLASS}
    >
      <section aria-labelledby="grades-livestream-label" className={OTHER_LIVESTREAM_CLASS}>
        <PartHeader
          id="grades-livestream-label"
          label="Livestream"
          isNew={newKeys.has(LIVESTREAM_SEEN_KEY)}
          points={<Points value={livestreamPoints} max={MAX_LIVESTREAM_POINTS} />}
        />
        <ProgressBar
          value={livestreamHours}
          max={Math.max(requiredHours, 1)}
          label="Livestream hours completed"
          className="mt-3"
        />
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {hours}/{required} hours completed, counted in Packages ({packagesWeight}). Full credit is {required}{" "}
          hours ({MAX_LIVESTREAM_POINTS} points, {POINTS_PER_LIVESTREAM_HOUR} per hour). Partial hours scale linearly.
        </p>
      </section>

      <section aria-labelledby="grades-portfolio-label" className={OTHER_PORTFOLIO_CLASS}>
        <PartHeader
          id="grades-portfolio-label"
          label="Portfolio"
          isNew={newKeys.has(PORTFOLIO_SEEN_KEY)}
          points={<Points value={portfolioPoints} max={MAX_PORTFOLIO_POINTS} />}
        />
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {portfolioPoints === null
            ? `Not graded yet. The ${portfolioWeight} portfolio weight is dropped until it is marked.`
            : `Counts as ${portfolioWeight} of the semester grade.`}
        </p>
        {portfolioFeedback.trim() ? (
          <ClampText text={portfolioFeedback} lines={4} className="mt-3 text-sm text-foreground" />
        ) : null}
      </section>
    </Panel>
  );
}

/** Caps label (+ New tag) on the left, mono points on the right, on one 24px line. */
function PartHeader({ id, label, isNew, points }: { id: string; label: string; isNew: boolean; points: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-2">
      <h3 id={id} className={LABEL_CLASS}>
        {label}
      </h3>
      {isNew ? <NewTag /> : null}
      <span className="ml-auto shrink-0">{points}</span>
    </div>
  );
}

function Points({ value, max }: { value: number | null; max: number }) {
  return (
    <span className="font-mono-broadcast text-base font-medium leading-tight tabular-nums">
      <span className={value === null ? "text-muted-foreground" : "text-foreground"}>{value ?? "—"}</span>
      <span className="text-sm text-muted-foreground"> / {max}</span>
    </span>
  );
}
