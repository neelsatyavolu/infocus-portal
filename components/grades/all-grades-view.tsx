"use client";

import { gradeScoreInput, numericGradeScore, parseGradeScore, type GradeScore } from "@/src/lib/grade-score";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  GRADE_WEIGHTS,
  MAX_FINAL_CUT_POINTS,
  MAX_LIVESTREAM_POINTS,
  MAX_PORTFOLIO_POINTS,
  hasGradeableWork,
  letterGrade,
  packageCategoryScore,
  participationCategoryScore,
  portfolioCategoryScore,
  weightedGradePercentage,
  type GradeInput
} from "@/src/lib/grading";
import { cycleSemesterTerm, parseSemesterTerm } from "@/src/lib/package-grades";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";
import type { GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

export type AllGradesCycle = {
  cycleNumber: number;
};

export type AllGradesEstimated = {
  percentage: number | null;
  letter: string | null;
  weights?: typeof GRADE_WEIGHTS;
  packages: {
    earned: number;
    possible: number;
    finalCutPoints: Array<number | null>;
    checkInPoints: Array<number | null>;
    checkInPossible?: Array<number | null>;
    livestreamPoints: number | null;
  };
  participation: { earned: number; possible: number };
  portfolio: {
    earned: number;
    possible: number;
    points: number | null;
    max: number;
  };
};

type WhatIfOverrides = {
  finalCuts: Record<number, GradeScore>;
  checkIns: Record<number, GradeScore>;
  weeks: Record<string, GradeScore>;
  livestream?: GradeScore;
  portfolio?: GradeScore;
};

const EMPTY_OVERRIDES: WhatIfOverrides = {
  finalCuts: {},
  checkIns: {},
  weeks: {}
};

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
  semesterTerm
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
}) {
  const [overrides, setOverrides] = useState<WhatIfOverrides>(EMPTY_OVERRIDES);
  const [openGroups, setOpenGroups] = useState({
    semester: true,
    packages: true,
    participation: true,
    other: true
  });

  const term = semesterTerm ?? parseSemesterTerm(semesterLabel);
  const visibleCycles = cycles.filter(
    (cycle) => term === null || cycleSemesterTerm(cycle.cycleNumber) === term
  );
  const visibleEstimated = estimated
    ? {
        ...estimated,
        packages: {
          ...estimated.packages,
          finalCutPoints: visibleCycles.map((cycle) => {
            const index = cycles.findIndex((entry) => entry.cycleNumber === cycle.cycleNumber);
            return estimated.packages.finalCutPoints[index] ?? null;
          }),
          checkInPoints: visibleCycles.map((cycle) => {
            const index = cycles.findIndex((entry) => entry.cycleNumber === cycle.cycleNumber);
            return estimated.packages.checkInPoints[index] ?? null;
          }),
          checkInPossible: visibleCycles.map((cycle) => {
            const index = cycles.findIndex((entry) => entry.cycleNumber === cycle.cycleNumber);
            return estimated.packages.checkInPossible?.[index] ?? null;
          })
        }
      }
    : undefined;

  const whatIf = useMemo(
    () => computeWhatIf(visibleEstimated, visibleCycles, weeks, overrides),
    [visibleEstimated, visibleCycles, weeks, overrides]
  );

  const hasWhatIf =
    Object.keys(overrides.finalCuts).length > 0 ||
    Object.keys(overrides.checkIns).length > 0 ||
    Object.keys(overrides.weeks).length > 0 ||
    overrides.livestream !== undefined ||
    overrides.portfolio !== undefined;

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

  const packageRows = visibleCycles.flatMap((cycle, index) => {
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

  const participationRows = weeks.map((week) => ({
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

  const otherRows = [
    {
      id: "livestream",
      name: `Livestream (${livestreamHours}/${requiredHours} hours completed)`,
      official: livestreamOfficial,
      max: MAX_LIVESTREAM_POINTS,
      value: overrides.livestream !== undefined ? overrides.livestream : livestreamOfficial,
      onChange: (next: GradeScore) => {
        const nextOverrides = { ...overrides };
        if (next === null) delete nextOverrides.livestream;
        else nextOverrides.livestream = next;
        setOverrides(nextOverrides);
      }
    },
    {
      id: "portfolio",
      name: "Portfolio",
      official: portfolioOfficial,
      max: MAX_PORTFOLIO_POINTS,
      value: overrides.portfolio !== undefined ? overrides.portfolio : portfolioOfficial,
      onChange: (next: GradeScore) => {
        const nextOverrides = { ...overrides };
        if (next === null) delete nextOverrides.portfolio;
        else nextOverrides.portfolio = next;
        setOverrides(nextOverrides);
      }
    }
  ];

  const packageScore = {
    earned: packageRows.reduce((total, row) => total + (numericGradeScore(row.value) ?? 0), 0),
    possible: packageRows.reduce((total, row) => total + (typeof row.value !== "number" ? 0 : row.max), 0)
  };
  const participationScore = {
    earned: participationRows.reduce((total, row) => total + (numericGradeScore(row.value) ?? 0), 0),
    possible: participationRows.reduce((total, row) => total + (typeof row.value !== "number" ? 0 : row.max), 0)
  };
  const otherScore = {
    earned: otherRows.reduce((total, row) => total + (numericGradeScore(row.value) ?? 0), 0),
    possible: otherRows.reduce((total, row) => total + (typeof row.value !== "number" ? 0 : row.max), 0)
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="display-sm text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {hasWhatIf ? (
            <button
              type="button"
              onClick={() => setOverrides(EMPTY_OVERRIDES)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              Reset what-if
            </button>
          ) : null}
          <GradeBadge
            compact
            letter={displayLetter}
            percentage={displayPct}
            label={hasWhatIf ? "What-if grade" : "Estimated grade"}
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading gradebook...
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <GradeGroup
            open={openGroups.semester}
            onToggle={() => setOpenGroups({ ...openGroups, semester: !openGroups.semester })}
            title={semesterLabel}
            meta={displayPct === null ? "—" : `${displayPct.toFixed(1)}%`}
            bar={displayPct}
            depth={0}
          >
            <GradeGroup
              open={openGroups.packages}
              onToggle={() => setOpenGroups({ ...openGroups, packages: !openGroups.packages })}
              title="Packages"
              meta={scoreLabel(packageScore)}
              bar={pctOf(packageScore.earned, packageScore.possible)}
              depth={1}
            >
              {packageRows.map((row) => (
                <GradeRow key={row.id} {...row} />
              ))}
            </GradeGroup>
            <GradeGroup
              open={openGroups.participation}
              onToggle={() => setOpenGroups({ ...openGroups, participation: !openGroups.participation })}
              title="Participation"
              meta={scoreLabel(participationScore)}
              bar={pctOf(participationScore.earned, participationScore.possible)}
              depth={1}
            >
              {participationRows.length === 0 ? (
                <div className="px-6 py-3 text-sm text-muted-foreground">No weeks yet.</div>
              ) : (
                participationRows.map((row) => <GradeRow key={row.id} {...row} />)
              )}
            </GradeGroup>
            <GradeGroup
              open={openGroups.other}
              onToggle={() => setOpenGroups({ ...openGroups, other: !openGroups.other })}
              title="Other"
              meta={scoreLabel(otherScore)}
              bar={pctOf(otherScore.earned, otherScore.possible)}
              depth={1}
            >
              {otherRows.map((row) => (
                <GradeRow key={row.id} {...row} />
              ))}
            </GradeGroup>
          </GradeGroup>
        </div>
      )}
    </section>
  );
}

export function GradeBadge({
  letter,
  percentage,
  label,
  compact = false
}: {
  letter: string | null | undefined;
  percentage: number | null | undefined;
  label: string;
  compact?: boolean;
}) {
  const pct =
    percentage !== null && percentage !== undefined ? `${percentage.toFixed(1)}%` : "Not gradeable yet";

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-[hsl(var(--background))] px-3 py-2">
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
          <div className="font-mono-broadcast tabular-nums text-xs font-semibold text-foreground">{pct}</div>
        </div>
        <div
          className={cn(
            "text-3xl font-semibold leading-none tracking-tight",
            letter ? "text-[var(--brand-green)]" : "text-muted-foreground"
          )}
        >
          {letter ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-[10rem] flex-col items-center justify-center rounded-2xl border border-border bg-[hsl(var(--background))] px-8 py-5 text-center shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-5xl font-semibold leading-none tracking-tight",
          letter ? "text-[var(--brand-green)]" : "text-muted-foreground"
        )}
      >
        {letter ?? "—"}
      </div>
      <div className="mt-2 font-mono-broadcast tabular-nums text-lg font-semibold text-foreground">{pct}</div>
    </div>
  );
}

function computeWhatIf(
  estimated: AllGradesEstimated | undefined,
  cycles: AllGradesCycle[],
  weeks: GradebookWeek[],
  overrides: WhatIfOverrides
) {
  if (!estimated) return null;

  const finalCutPoints = (estimated.packages.finalCutPoints ?? []).map((value, index) => {
    const cycleNumber = cycles[index]?.cycleNumber ?? index + 1;
    return cycleNumber in overrides.finalCuts ? numericGradeScore(overrides.finalCuts[cycleNumber]!) : value;
  });
  const checkInPoints = (estimated.packages.checkInPoints ?? []).map((value, index) => {
    const cycleNumber = cycles[index]?.cycleNumber ?? index + 1;
    return cycleNumber in overrides.checkIns ? numericGradeScore(overrides.checkIns[cycleNumber]!) : value;
  });
  const checkInPossible = (estimated.packages.checkInPossible ?? []).map((value, index) => {
    const cycleNumber = cycles[index]?.cycleNumber ?? index + 1;
    if (cycleNumber in overrides.checkIns) {
      return typeof overrides.checkIns[cycleNumber] === "number" ? (value ?? MAX_CHECK_IN_POINTS_PER_CYCLE) : null;
    }
    return value ?? null;
  });

  let participationEarned = estimated.participation.earned;
  let participationPossible = estimated.participation.possible;
  if (weeks.length > 0) {
    participationEarned = 0;
    participationPossible = 0;
    for (const week of weeks) {
      if (week.weekStart in overrides.weeks) {
        const score = numericGradeScore(overrides.weeks[week.weekStart]!);
        if (score !== null) {
          participationEarned += score;
          participationPossible += Math.max(week.fullPossible, 1);
        }
      } else if (week.graded) {
        participationEarned += week.earned;
        participationPossible += week.possible;
      }
    }
  }

  const input: GradeInput = {
    finalCutPoints,
    checkInPoints,
    checkInPossible,
    livestreamPoints:
      overrides.livestream !== undefined ? numericGradeScore(overrides.livestream) : estimated.packages.livestreamPoints,
    participationEarned,
    participationPossible,
    portfolioPoints: overrides.portfolio !== undefined ? numericGradeScore(overrides.portfolio) : estimated.portfolio.points
  };
  if (!hasGradeableWork(input)) {
    return {
      percentage: null,
      letter: null,
      packages: packageCategoryScore(input),
      participation: participationCategoryScore(input),
      portfolio: portfolioCategoryScore(input)
    };
  }
  const percentage = weightedGradePercentage(input);
  return {
    percentage,
    letter: letterGrade(percentage),
    packages: packageCategoryScore(input),
    participation: participationCategoryScore(input),
    portfolio: portfolioCategoryScore(input)
  };
}

function GradeGroup({
  open,
  onToggle,
  title,
  meta,
  bar,
  depth,
  children
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  meta: string;
  bar: number | null;
  depth: number;
  children: ReactNode;
}) {
  return (
    <div className={cn(depth === 0 ? "" : "border-t border-foreground/10")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-b border-foreground/10 px-4 py-3 text-left hover:bg-foreground/[0.03]"
        style={{ paddingLeft: 16 + depth * 16 }}
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition", open ? "" : "-rotate-90")} />
        <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--brand-green)]">
          {title}
        </span>
        <span className="font-mono-broadcast tabular-nums text-sm text-[var(--brand-green)]">{meta}</span>
        <span className="w-16">
          {bar === null ? (
            <span className="block h-0.5 bg-foreground/10" />
          ) : (
            <span className="block h-0.5 overflow-hidden bg-foreground/10">
              <span
                className="block h-full bg-[var(--brand-green)]"
                style={{ width: `${Math.min(100, bar)}%` }}
              />
            </span>
          )}
        </span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}

function GradeRow({
  name,
  official,
  max,
  value,
  onChange
}: {
  name: string;
  official: number | null;
  max: number;
  value: GradeScore;
  onChange: (next: GradeScore) => void;
}) {
  const dirty = value !== official;
  return (
    <div className="flex items-center gap-3 border-t border-foreground/5 px-4 py-2.5" style={{ paddingLeft: 48 }}>
      <div className="min-w-0 flex-1 text-sm text-foreground">{name}</div>
      <label className="flex min-w-[7.5rem] items-center justify-end gap-1 text-right">
        <input
          type="text"
          aria-label={`${name} what-if score`}
          title="Enter points, - for ungraded, or \ for exempt. Clear to restore the official score."
          value={gradeScoreInput(value)}
          placeholder="—"
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const parsed = parseGradeScore(raw, max);
            if (parsed !== undefined) onChange(parsed);
          }}
          className={cn(
            "w-14 rounded-md border bg-transparent px-1.5 py-1 text-right font-mono-broadcast tabular-nums text-sm outline-none",
            dirty
              ? "border-[var(--brand-green)]/50 text-[var(--brand-green)]"
              : "border-transparent text-foreground hover:border-border focus:border-border"
          )}
        />
        <span className="text-sm text-muted-foreground">/ {max}</span>
      </label>
      <div className="w-10 text-right text-[11px] text-muted-foreground">
        {value === "EXEMPT" ? "Exempt" : value === "UNGRADED" ? "—" : value === null ? "N/A" : dirty ? "What-if" : ""}
      </div>
    </div>
  );
}

function pctOf(earned: number, possible: number) {
  if (possible <= 0) return null;
  return Number(((earned / possible) * 100).toFixed(1));
}

function scoreLabel(score: { earned: number; possible: number }) {
  if (score.possible <= 0) return "0 / 0";
  return `${score.earned} / ${score.possible}`;
}
