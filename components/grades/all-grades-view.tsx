"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Kbd } from "@/components/kit/kbd";
import { useRememberedState } from "@/components/kit/remembered-state";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/grades/grade-badge";
import {
  GradebookHeader,
  GradebookSkeletonRows,
  GradeGroupEmpty,
  GradeGroupRow,
  GradeItemRow
} from "@/components/grades/all-grades-rows";
import {
  EMPTY_OVERRIDES,
  categoryTotalsOf,
  computeWhatIf,
  formatPoints,
  groupScore,
  hasOverrides,
  visibleEstimatedOf,
  type AllGradesCycle,
  type AllGradesEstimated,
  type GradeItem,
  type WhatIfOverrides
} from "@/components/grades/what-if";
import { formatHours, pctOf, weightLabel } from "@/components/grades/grade-math";
import { WhatIfRail, type WeightedCategory } from "@/components/grades/what-if-rail";
import type { GradeScore } from "@/src/lib/grade-score";
import {
  GRADE_WEIGHTS,
  MAX_FINAL_CUT_POINTS,
  MAX_LIVESTREAM_POINTS,
  MAX_PORTFOLIO_POINTS
} from "@/src/lib/grading";
import { cycleSemesterTerm, parseSemesterTerm } from "@/src/lib/package-grades";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";
import type { GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

// Kept exported from here so this module's public surface is the same as before the split.
export { GradeBadge };
export type { AllGradesCycle, AllGradesEstimated };

type GroupKey = "semester" | "packages" | "participation" | "other";
type OpenGroups = Record<GroupKey, boolean>;

const DEFAULT_OPEN: OpenGroups = { semester: true, packages: true, participation: true, other: true };

function isOpenGroups(value: unknown): value is OpenGroups {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (Object.keys(DEFAULT_OPEN) as GroupKey[]).every((key) => typeof record[key] === "boolean");
}

/**
 * The grouped gradebook (Schoology style) with inline what-if scores, shared by /grades and the
 * Grade Editor Student tab. One card: a toolbar row (readout + Reset), column labels, the
 * semester → Packages / Participation / Other tree, and a legend for the typing shortcuts. When
 * its container is wide (56rem+, on /grades and in the Grade Editor detail pane alike) the
 * readout, Reset and legend move to a summary rail beside the table, which also shows how each
 * weighted category moves. Nothing is saved; remounting (Grade Editor keys it by student) resets
 * the what-if.
 */
export function AllGradesView({
  loading,
  semesterLabel,
  cycles,
  estimated,
  weeks,
  livestreamHours,
  requiredHours,
  title = "All Grades",
  description = "Schoology-style gradebook. Edit any score to try a what-if. Ungraded stays N/A until you fill it in.",
  semesterTerm,
  intro = true
}: {
  loading: boolean;
  semesterLabel: string;
  cycles: AllGradesCycle[];
  estimated?: AllGradesEstimated;
  weeks: GradebookWeek[];
  livestreamHours: number;
  requiredHours: number;
  title?: string;
  description?: string;
  semesterTerm?: 1 | 2;
  /** false hides the title and description (a page header above already says them). */
  intro?: boolean;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<WhatIfOverrides>(EMPTY_OVERRIDES);
  const [openGroups, setOpenGroups] = useRememberedState<OpenGroups>("grades:all-grades:open:v1", DEFAULT_OPEN, isOpenGroups);

  const term = semesterTerm ?? parseSemesterTerm(semesterLabel);
  const visibleCycles = useMemo(
    () => cycles.filter((cycle) => term === null || cycleSemesterTerm(cycle.cycleNumber) === term),
    [cycles, term]
  );
  const visibleEstimated = useMemo(
    () => visibleEstimatedOf(estimated, cycles, visibleCycles),
    [estimated, cycles, visibleCycles]
  );
  const whatIf = useMemo(
    () => computeWhatIf(visibleEstimated, visibleCycles, weeks, overrides),
    [visibleEstimated, visibleCycles, weeks, overrides]
  );

  const hasWhatIf = hasOverrides(overrides);
  const officialPct = estimated?.percentage ?? null;
  const displayPct = hasWhatIf && whatIf ? whatIf.percentage : officialPct;
  const displayLetter = hasWhatIf && whatIf ? whatIf.letter : estimated?.letter;

  function setOverride<K extends keyof WhatIfOverrides>(key: K, value: WhatIfOverrides[K]) {
    setOverrides({ ...overrides, [key]: value });
  }

  function clearOverride(kind: "finalCuts" | "checkIns" | "weeks", id: number | string) {
    const next = { ...overrides[kind] };
    delete next[id as never];
    setOverrides({ ...overrides, [kind]: next });
  }

  function setOtherOverride(key: "livestream" | "portfolio", next: GradeScore) {
    const nextOverrides = { ...overrides };
    if (next === null) delete nextOverrides[key];
    else nextOverrides[key] = next;
    setOverrides(nextOverrides);
  }

  const toggleGroup = (key: GroupKey) => setOpenGroups((previous) => ({ ...previous, [key]: !previous[key] }));

  /** Enter / Shift+Enter in a score box moves to the next / previous box. */
  const moveFocus = useCallback((from: HTMLInputElement, step: 1 | -1) => {
    const inputs = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>("input[data-grade-score]") ?? []);
    const next = inputs[inputs.indexOf(from) + step];
    if (!next) return;
    next.focus();
    next.select();
  }, []);

  const packageRows: GradeItem[] = visibleCycles.flatMap((cycle, index) => {
    const officialFinal = visibleEstimated?.packages.finalCutPoints[index] ?? null;
    const officialCheck = visibleEstimated?.packages.checkInPoints[index] ?? null;
    const officialCheckPossible = visibleEstimated?.packages.checkInPossible?.[index] ?? null;
    return [
      {
        id: `fc-${cycle.cycleNumber}`,
        name: `Cycle ${cycle.cycleNumber} Final Cut`,
        official: officialFinal,
        max: MAX_FINAL_CUT_POINTS,
        value: cycle.cycleNumber in overrides.finalCuts ? overrides.finalCuts[cycle.cycleNumber] : officialFinal,
        onChange: (next: GradeScore) => {
          if (next === null) {
            clearOverride("finalCuts", cycle.cycleNumber);
            return;
          }
          setOverride("finalCuts", { ...overrides.finalCuts, [cycle.cycleNumber]: next });
        }
      },
      {
        id: `ci-${cycle.cycleNumber}`,
        name: `Cycle ${cycle.cycleNumber} Check-ins`,
        official: officialCheck,
        max: officialCheckPossible ?? MAX_CHECK_IN_POINTS_PER_CYCLE,
        value: cycle.cycleNumber in overrides.checkIns ? overrides.checkIns[cycle.cycleNumber] : officialCheck,
        onChange: (next: GradeScore) => {
          if (next === null) {
            clearOverride("checkIns", cycle.cycleNumber);
            return;
          }
          setOverride("checkIns", { ...overrides.checkIns, [cycle.cycleNumber]: next });
        }
      }
    ];
  });

  const participationRows: GradeItem[] = weeks.map((week) => ({
    id: `wk-${week.weekStart}`,
    name: `Week of ${week.label}`,
    official: week.graded ? week.earned : null,
    max: week.fullPossible || week.possible || 50,
    value: week.weekStart in overrides.weeks ? overrides.weeks[week.weekStart] : week.graded ? week.earned : null,
    onChange: (next: GradeScore) => {
      if (next === null) {
        clearOverride("weeks", week.weekStart);
        return;
      }
      setOverride("weeks", { ...overrides.weeks, [week.weekStart]: next });
    }
  }));

  const livestreamOfficial = visibleEstimated?.packages.livestreamPoints ?? null;
  const portfolioOfficial = visibleEstimated?.portfolio.points ?? null;

  const otherRows: GradeItem[] = [
    {
      id: "livestream",
      name: "Livestream",
      sub: `${formatHours(livestreamHours)}/${formatHours(requiredHours)} hours completed`,
      official: livestreamOfficial,
      max: MAX_LIVESTREAM_POINTS,
      value: overrides.livestream !== undefined ? overrides.livestream : livestreamOfficial,
      onChange: (next: GradeScore) => setOtherOverride("livestream", next)
    },
    {
      id: "portfolio",
      name: "Portfolio",
      official: portfolioOfficial,
      max: MAX_PORTFOLIO_POINTS,
      value: overrides.portfolio !== undefined ? overrides.portfolio : portfolioOfficial,
      onChange: (next: GradeScore) => setOtherOverride("portfolio", next)
    }
  ];

  const groups: Array<{ key: Exclude<GroupKey, "semester">; title: string; rows: GradeItem[]; empty?: string }> = [
    { key: "packages", title: "Packages", rows: packageRows },
    { key: "participation", title: "Participation", rows: participationRows, empty: "No weeks yet." },
    { key: "other", title: "Other", rows: otherRows }
  ];

  // Official totals until a score is edited, so the rail matches the official letter above it.
  const categoryTotals = categoryTotalsOf(estimated, whatIf, hasWhatIf);
  const categories: WeightedCategory[] = [
    {
      key: "packages",
      label: "Packages",
      weight: weightLabel(GRADE_WEIGHTS.packages),
      hint: "Final cuts, check-ins and livestream",
      score: categoryTotals?.packages ?? null
    },
    {
      key: "participation",
      label: "Participation",
      weight: weightLabel(GRADE_WEIGHTS.participation),
      score: categoryTotals?.participation ?? null
    },
    { key: "portfolio", label: "Portfolio", weight: weightLabel(GRADE_WEIGHTS.portfolio), score: categoryTotals?.portfolio ?? null }
  ];

  const resetWhatIf = () => setOverrides(EMPTY_OVERRIDES);
  const official = (
    <>
      Official {estimated?.letter ?? "—"} ·{" "}
      {officialPct === null ? "not gradeable yet" : <span className="font-mono-broadcast tabular-nums">{officialPct.toFixed(1)}%</span>}
    </>
  );
  const legend = (
    <>
      Type a number to try a what-if · <Kbd>-</Kbd> ungraded · <Kbd>\</Kbd> exempt · clear a box to restore the official
      score. Nothing is saved.
    </>
  );

  return (
    <div className="@container min-w-0">
      <div className="grid min-w-0 gap-5 @4xl:grid-cols-[minmax(0,1fr)_18rem] @4xl:items-start">
        <section
          aria-labelledby={intro ? titleId : undefined}
          aria-label={intro ? undefined : "Gradebook"}
          className="flex min-w-0 flex-col rounded-md border border-border bg-card text-card-foreground"
        >
          {/* With no title, the whole toolbar moves to the rail on wide containers. */}
          <div
            className={cn(
              "flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center md:px-5",
              !intro && "@4xl:hidden"
            )}
          >
            {intro ? (
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
                  {title}
                </h2>
                <p className="text-[13px] leading-snug text-muted-foreground">{description}</p>
              </div>
            ) : null}
            <div
              className={cn(
                "flex min-w-0 items-center justify-between gap-3 @4xl:hidden",
                intro ? "sm:justify-end" : "flex-1"
              )}
            >
              <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {loading ? (
                  <Skeleton className="h-6 w-40" />
                ) : (
                  <GradeBadge
                    compact
                    letter={displayLetter}
                    percentage={displayPct}
                    label={hasWhatIf ? "What-if" : "Estimated"}
                    tone={hasWhatIf ? "success" : "neutral"}
                  />
                )}
                {hasWhatIf ? <span className="text-xs text-muted-foreground">{official}</span> : null}
              </div>
              {/* Always rendered (disabled until something changes), so the readout never shifts. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 max-sm:h-10"
                disabled={!hasWhatIf}
                onClick={resetWhatIf}
              >
                <RotateCcw aria-hidden />
                Reset what-if
              </Button>
            </div>
          </div>

          <GradebookHeader />

          {loading ? (
            <GradebookSkeletonRows />
          ) : (
            <div ref={listRef}>
              <GradeGroupRow
                depth={0}
                open={openGroups.semester}
                onToggle={() => toggleGroup("semester")}
                title={semesterLabel}
                score={displayPct === null ? "—" : `${displayPct.toFixed(1)}%`}
                bar={displayPct}
              />
              {openGroups.semester
                ? groups.map((group) => {
                    const score = groupScore(group.rows);
                    return (
                      <div key={group.key}>
                        <GradeGroupRow
                          depth={1}
                          open={openGroups[group.key]}
                          onToggle={() => toggleGroup(group.key)}
                          title={group.title}
                          score={formatPoints(score.possible > 0 ? score.earned : 0)}
                          outOf={`/ ${formatPoints(score.possible)}`}
                          bar={pctOf(score.earned, score.possible)}
                        />
                        {openGroups[group.key] ? (
                          group.rows.length === 0 && group.empty ? (
                            <GradeGroupEmpty>{group.empty}</GradeGroupEmpty>
                          ) : (
                            group.rows.map(({ id, ...row }) => <GradeItemRow key={id} id={id} {...row} onMove={moveFocus} />)
                          )
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </div>
          )}

          <p className="mt-auto px-4 py-3 text-xs leading-relaxed text-muted-foreground md:px-5 @4xl:hidden">{legend}</p>
        </section>

        <div className="hidden min-w-0 @4xl:sticky @4xl:top-[calc(var(--app-header-h,0px)+1rem)] @4xl:block">
          <WhatIfRail
            loading={loading}
            hasWhatIf={hasWhatIf}
            letter={displayLetter}
            percentage={displayPct}
            official={official}
            categories={categories}
            onReset={resetWhatIf}
            legend={legend}
          />
        </div>
      </div>
    </div>
  );
}
