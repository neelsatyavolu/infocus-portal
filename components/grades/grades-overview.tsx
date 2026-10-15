"use client";

import { GradeBadge } from "@/components/grades/grade-badge";
import { CategoryMeter } from "@/components/grades/grade-parts";
import { weightLabel } from "@/components/grades/grade-math";
import { GradesOther } from "@/components/grades/grades-other";
import { GradesPackages } from "@/components/grades/grades-packages";
import { GradesParticipation } from "@/components/grades/grades-participation";
import {
  BAND_GRID_CLASS,
  OVERVIEW_GRID_CLASS,
  OVERVIEW_OTHER_CLASS,
  OVERVIEW_PACKAGES_CLASS,
  OVERVIEW_PARTICIPATION_CLASS
} from "@/components/grades/grades-layout";
import type { EstimatedPayload, GradebookPayload, GradeTile, Totals } from "@/components/grades/grades-types";
import { GRADE_WEIGHTS } from "@/src/lib/grading";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";
import type { GradebookCheckIn, GradebookWeek } from "@/src/lib/student-gradebook";

/**
 * The student's whole grade on one screen: the grade band (estimated grade + Packages,
 * Participation and Other totals), then Packages, Livestream & portfolio and Participation:
 * stacked below xl, Participation in a rail beside the other two from xl (grades-layout.ts).
 */
export function GradesOverview({
  estimated,
  gradebook,
  semesterCycles,
  scoreCycles,
  packageTotals,
  otherTotals,
  checkInByCycle,
  weeks,
  weekIndex,
  onWeekIndex,
  newKeys
}: {
  estimated: EstimatedPayload | undefined;
  gradebook: GradebookPayload | undefined;
  semesterCycles: GradeTile[];
  scoreCycles: GradeTile[];
  packageTotals: Totals;
  /** Livestream + portfolio (a UI grouping; livestream still counts in the packages weight). */
  otherTotals: Totals;
  checkInByCycle: Map<number, GradebookCheckIn>;
  weeks: GradebookWeek[];
  weekIndex: number;
  onWeekIndex: (index: number) => void;
  newKeys: ReadonlySet<string>;
}) {
  const livestreamHours = gradebook?.livestreamHours ?? 0;
  const requiredHours = gradebook?.requiredLivestreamHours ?? REQUIRED_LIVESTREAM_HOURS;
  return (
    <div className="space-y-5">
      <GradeBand estimated={estimated} packageTotals={packageTotals} otherTotals={otherTotals} weeks={weeks} />

      <div className={OVERVIEW_GRID_CLASS}>
        <GradesPackages
          cycles={semesterCycles}
          scoreCycles={scoreCycles}
          estimated={estimated}
          checkInByCycle={checkInByCycle}
          newKeys={newKeys}
          className={OVERVIEW_PACKAGES_CLASS}
        />
        <GradesOther
          livestreamPoints={estimated?.packages.livestreamPoints ?? null}
          livestreamHours={livestreamHours}
          requiredHours={requiredHours}
          portfolioPoints={estimated?.portfolio.points ?? null}
          portfolioFeedback={gradebook?.portfolioFeedback ?? ""}
          newKeys={newKeys}
          className={OVERVIEW_OTHER_CLASS}
        />
        <GradesParticipation
          weeks={weeks}
          weekIndex={weekIndex}
          onWeekIndex={onWeekIndex}
          newKeys={newKeys}
          className={OVERVIEW_PARTICIPATION_CLASS}
        />
      </div>
    </div>
  );
}

/**
 * One card split by hairlines: the estimated grade, then Packages, Participation and Other
 * (livestream + portfolio), with the same totals the screen has always shown. 2×2 from sm, four
 * across only from xl (the sidebar takes 240px at lg). Only real grade categories carry a weight;
 * Other is a grouping (livestream counts in Packages, the portfolio weight is in the plate line).
 */
function GradeBand({
  estimated,
  packageTotals,
  otherTotals,
  weeks
}: {
  estimated: EstimatedPayload | undefined;
  packageTotals: Totals;
  otherTotals: Totals;
  weeks: GradebookWeek[];
}) {
  const participation = estimated?.participation ?? { earned: 0, possible: 0 };
  const gradedWeeks = weeks.filter((week) => week.graded).length;
  return (
    <section aria-labelledby="grades-band-title" className="overflow-hidden rounded-md border border-border bg-card">
      <h2 id="grades-band-title" className="sr-only">
        Estimated grade
      </h2>
      <div className={BAND_GRID_CLASS}>
        <div className="min-w-0">
          <GradeBadge letter={estimated?.letter} percentage={estimated?.percentage} label="Estimated grade" />
        </div>
        <CategoryMeter
          label="Packages"
          weight={weightLabel(GRADE_WEIGHTS.packages)}
          totals={packageTotals}
          hint="Final cuts + check-ins"
        />
        <CategoryMeter
          label="Participation"
          weight={weightLabel(GRADE_WEIGHTS.participation)}
          totals={participation}
          hint={weeks.length > 0 ? `${gradedWeeks} of ${weeks.length} weeks graded` : "No weeks yet"}
        />
        <CategoryMeter label="Other" totals={otherTotals} hint="Livestream + portfolio" />
      </div>
    </section>
  );
}
