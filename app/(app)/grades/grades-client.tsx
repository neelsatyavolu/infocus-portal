"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AllGradesView, GradeBadge } from "@/components/grades/all-grades-view";
import {
  GRADE_WEIGHTS,
  MAX_FINAL_CUT_POINTS,
  MAX_LIVESTREAM_POINTS,
  MAX_PORTFOLIO_POINTS
} from "@/src/lib/grading";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";
import {
  CHECK_IN_STAGES,
  MAX_CHECK_IN_POINTS_PER_CYCLE,
  PACKAGE_STAGE_LABELS
} from "@/src/lib/package-stages";
import { cycleSemesterTerm, parseSemesterTerm } from "@/src/lib/package-grades";
import type { GradebookCheckIn, GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

type GradeTab = "home" | "packages" | "participation" | "other" | "all";

type GradeTile = {
  cycleNumber: number;
  focus: string;
  published: boolean;
  effortPoints: number | null;
  teamworkPoints: number | null;
  previousEffortPoints: number | null;
  previousTeamworkPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
  revised: boolean;
  revisedAt: string | null;
  feedback: string | null;
  reviewProjectId: string | null;
  reviewMediaId: string | null;
};

type EstimatedPayload = {
  percentage: number | null;
  letter: string | null;
  weights: typeof GRADE_WEIGHTS;
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

type GradebookPayload = {
  semester: { label: string; start: string; end: string };
  weeks: GradebookWeek[];
  livestreamHours: number;
  requiredLivestreamHours: number;
  portfolioFeedback: string;
  checkIns: GradebookCheckIn[];
};

type GradesMePayload = {
  role: "ASSOCIATE_PRODUCER" | "EXECUTIVE_PRODUCER" | "SUPER_ADMIN" | "ADVISER" | null;
  isAdmin: boolean;
  summary: {
    publishedCycleCount: number;
    averageTotal: number | null;
    averagePercentage: number | null;
    extensionsRemaining: number | null;
  };
  estimated?: EstimatedPayload;
  cycles: GradeTile[];
  gradebook?: GradebookPayload;
};

const TABS: Array<{ id: GradeTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "packages", label: "Packages" },
  { id: "participation", label: "Participation" },
  { id: "other", label: "Other" },
  { id: "all", label: "All Grades" }
];

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const CHECK_IN_SHORT = {
  pitching: "Pitch",
  proofOfContact: "Brainstorm",
  aRollBRoll: "A/B",
  initialCut: "Initial"
} as const;

async function fetchGrades() {
  const response = await fetch("/api/grades/me", { cache: "no-store" });
  const payload = (await response.json()) as { data?: GradesMePayload; error?: { message?: string } };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load grade viewer.");
  }

  return payload.data;
}

function cycleTitle(cycle: GradeTile): string {
  const focus = cycle.focus?.trim();
  if (focus) return `Cycle ${cycle.cycleNumber} · ${focus.split(/[—\-:]/)[0].trim().slice(0, 32)}`;
  return `Cycle ${cycle.cycleNumber} · ${MONTH_LABELS[(cycle.cycleNumber - 1) % 12]}`;
}

function focusSubtitle(cycle: GradeTile): string {
  if (!cycle.published) return "Grading not yet published";
  if (cycle.revised) return "Revised grade reviewed";
  return cycle.focus?.trim() ? cycle.focus : "Producer feedback published";
}

function pctOf(earned: number, possible: number) {
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

function sumGraded(values: Array<number | null>) {
  return values.reduce(
    (acc, value) => {
      if (value === null) return acc;
      return { earned: acc.earned + value, count: acc.count + 1 };
    },
    { earned: 0, count: 0 }
  );
}

export default function GradesClient() {
  const [data, setData] = useState<GradesMePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<GradeTab>("home");
  const [weekIndex, setWeekIndex] = useState(0);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        setLoading(true);
        setMessage(null);
        const next = await fetchGrades();
        if (!active) return;
        setData(next);

        const weeks = next.gradebook?.weeks ?? [];
        if (weeks.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const current = weeks.findIndex((week, index) => {
            const nextStart = weeks[index + 1]?.weekStart;
            return week.weekStart <= today && (!nextStart || nextStart > today);
          });
          setWeekIndex(current >= 0 ? current : weeks.length - 1);
        }
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Failed to load grade viewer.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const orderedCycles = useMemo(() => {
    return [...(data?.cycles ?? [])].sort((a, b) => a.cycleNumber - b.cycleNumber);
  }, [data]);

  const estimated = data?.estimated;
  const gradebook = data?.gradebook;
  const weeks = useMemo(() => gradebook?.weeks ?? [], [gradebook?.weeks]);
  const activeWeek = weeks[weekIndex] ?? null;

  const packageTotals = useMemo(() => {
    const finals = sumGraded(estimated?.packages.finalCutPoints ?? []);
    const checkPoints = estimated?.packages.checkInPoints ?? [];
    const checkPossible = estimated?.packages.checkInPossible ?? [];
    const checks = sumGraded(checkPoints);
    const possibleChecks = checkPoints.reduce<number>((total, earned, index) => {
      if (earned === null) return total;
      return total + (checkPossible[index] ?? MAX_CHECK_IN_POINTS_PER_CYCLE);
    }, 0);
    return {
      earned: finals.earned + checks.earned,
      possible: finals.count * MAX_FINAL_CUT_POINTS + possibleChecks
    };
  }, [estimated]);

  const otherTotals = useMemo(() => {
    const livestream = estimated?.packages.livestreamPoints ?? null;
    const portfolio = estimated?.portfolio.points ?? null;
    return {
      earned: (livestream ?? 0) + (portfolio ?? 0),
      possible:
        (livestream === null ? 0 : MAX_LIVESTREAM_POINTS) +
        (portfolio === null ? 0 : MAX_PORTFOLIO_POINTS)
    };
  }, [estimated]);

  const letter = estimated?.letter;
  const percentage = estimated?.percentage;
  const checkInByCycle = new Map((gradebook?.checkIns ?? []).map((row) => [row.cycleNumber, row]));
  const semesterTerm = parseSemesterTerm(gradebook?.semester.label ?? "");
  const semesterCycles = useMemo(
    () =>
      orderedCycles.filter(
        (cycle) => semesterTerm === null || cycleSemesterTerm(cycle.cycleNumber) === semesterTerm
      ),
    [orderedCycles, semesterTerm]
  );

  return (
    <div className="route-enter mx-auto w-full max-w-7xl space-y-5 pb-24">
      {message ? (
        <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
          {message}
        </p>
      ) : null}

      {tab === "home" ? (
        <HomeView
          loading={loading}
          letter={letter}
          percentage={percentage}
          packageTotals={packageTotals}
          participation={estimated?.participation ?? { earned: 0, possible: 0 }}
          otherTotals={otherTotals}
        />
      ) : null}

      {tab === "packages" ? (
        <PackagesView
          loading={loading}
          cycles={semesterCycles}
          scoreCycles={orderedCycles}
          estimated={estimated}
          checkInByCycle={checkInByCycle}
        />
      ) : null}

      {tab === "participation" ? (
        <ParticipationView
          loading={loading}
          weeks={weeks}
          weekIndex={weekIndex}
          onWeekIndex={setWeekIndex}
          week={activeWeek}
          total={estimated?.participation ?? { earned: 0, possible: 0 }}
        />
      ) : null}

      {tab === "other" ? (
        <OtherView
          loading={loading}
          livestreamPoints={estimated?.packages.livestreamPoints ?? null}
          livestreamHours={gradebook?.livestreamHours ?? 0}
          requiredHours={gradebook?.requiredLivestreamHours ?? REQUIRED_LIVESTREAM_HOURS}
          portfolioPoints={estimated?.portfolio.points ?? null}
          portfolioFeedback={gradebook?.portfolioFeedback ?? ""}
        />
      ) : null}

      {tab === "all" ? (
        <AllGradesView
          loading={loading}
          semesterLabel={gradebook?.semester.label ?? "26-27 S1"}
          cycles={orderedCycles}
          estimated={estimated}
          weeks={weeks}
          livestreamHours={gradebook?.livestreamHours ?? 0}
          requiredHours={gradebook?.requiredLivestreamHours ?? REQUIRED_LIVESTREAM_HOURS}
        />
      ) : null}

      <section className="sticky bottom-4 z-20 mx-auto flex justify-center px-2">
        <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-foreground/[0.08] bg-black/85 light:bg-muted p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex shrink-0 items-center rounded-lg px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] transition sm:px-4 sm:text-[12px] sm:tracking-[0.18em]",
                  active
                    ? "bg-[var(--brand-green)] text-[var(--ink)]"
                    : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function HomeView({
  loading,
  letter,
  percentage,
  packageTotals,
  participation,
  otherTotals
}: {
  loading: boolean;
  letter: string | null | undefined;
  percentage: number | null | undefined;
  packageTotals: { earned: number; possible: number };
  participation: { earned: number; possible: number };
  otherTotals: { earned: number; possible: number };
}) {
  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="eyebrow">Grades · 2026–27</div>
            <h1 className="display-md mt-2 text-foreground">Grade Dashboard</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Estimated semester grade from packages (55%), participation (35%), and portfolio (10%).
              Ungraded work is excluded until a producer marks it.
            </p>
          </div>
          <GradeBadge letter={letter} percentage={percentage} label="Estimated grade" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CategoryCard
          label="Packages"
          weight="55%"
          earned={packageTotals.earned}
          possible={packageTotals.possible}
          loading={loading}
          hint="Final cuts + check-ins"
        />
        <CategoryCard
          label="Participation"
          weight="35%"
          earned={participation.earned}
          possible={participation.possible}
          loading={loading}
          hint="Mon 10 · Tue/Thu 20 · holidays off"
        />
        <CategoryCard
          label="Other"
          weight="Livestream + portfolio"
          earned={otherTotals.earned}
          possible={otherTotals.possible}
          loading={loading}
          hint="Livestream 8h / 40 pts · portfolio / 100"
        />
      </section>
    </>
  );
}

function PackagesView({
  loading,
  cycles,
  scoreCycles,
  estimated,
  checkInByCycle
}: {
  loading: boolean;
  cycles: GradeTile[];
  scoreCycles: GradeTile[];
  estimated?: EstimatedPayload;
  checkInByCycle: Map<number, GradebookCheckIn>;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h1 className="display-sm text-foreground">Packages</h1>
        <p className="text-xs text-muted-foreground">
          Final cuts and check-ins. Each stage is 5 points after its deadline. A-roll/B-roll requires approval; PoC and Initial Cut require submission.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading grades...
        </div>
      ) : cycles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground">
          No cycles found yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cycles.map((cycle) => {
            const scoreIndex = scoreCycles.findIndex((entry) => entry.cycleNumber === cycle.cycleNumber);
            const finalCut = scoreIndex >= 0 ? estimated?.packages.finalCutPoints[scoreIndex] ?? null : null;
            const checkIn = scoreIndex >= 0 ? estimated?.packages.checkInPoints[scoreIndex] ?? null : null;
            const checkPossible =
              scoreIndex >= 0 ? estimated?.packages.checkInPossible?.[scoreIndex] ?? null : null;
            const stages = checkInByCycle.get(cycle.cycleNumber);
            return (
              <article
                key={cycle.cycleNumber}
                className={cn(
                  "flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5 transition",
                  !cycle.published && "opacity-90"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="display-sm text-foreground">{cycleTitle(cycle)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{focusSubtitle(cycle)}</p>
                  </div>
                  <span
                    className={cn(
                      "status-pill",
                      cycle.published && cycle.revised
                        ? "status-warn"
                        : cycle.published
                          ? "status-approved"
                          : "status-neutral"
                    )}
                  >
                    {cycle.published ? (cycle.revised ? "Published · revised" : "Published") : "In progress"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <PointsCell label="Final cut" value={finalCut} max={MAX_FINAL_CUT_POINTS} dim={finalCut === null} />
                  <PointsCell
                    label="Check-ins"
                    value={checkIn}
                    max={checkPossible ?? MAX_CHECK_IN_POINTS_PER_CYCLE}
                    dim={checkIn === null}
                  />
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {CHECK_IN_STAGES.map((stage) => {
                    const done = Boolean(stages?.[stage]);
                    return (
                      <div
                        key={stage}
                        title={PACKAGE_STAGE_LABELS[stage]}
                        className={cn(
                          "rounded-md border px-1 py-1.5 text-center text-[10px] font-medium",
                          done
                            ? "border-[var(--brand-green)]/40 bg-[var(--brand-green)]/15 text-foreground"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {CHECK_IN_SHORT[stage]}
                        {done ? " ✓" : ""}
                      </div>
                    );
                  })}
                </div>

                {cycle.published && cycle.feedback?.trim() ? (
                  <div className="rounded-lg border border-border bg-[hsl(var(--background))] p-3">
                    <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Producer note
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{cycle.feedback}</p>
                  </div>
                ) : null}

                {cycle.published && cycle.reviewProjectId && cycle.reviewMediaId ? (
                  <Link
                    href={`/projects/${cycle.reviewProjectId}/review/${cycle.reviewMediaId}`}
                    className="inline-flex w-fit items-center rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent"
                  >
                    View package feedback
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ParticipationView({
  loading,
  weeks,
  weekIndex,
  onWeekIndex,
  week,
  total
}: {
  loading: boolean;
  weeks: GradebookWeek[];
  weekIndex: number;
  onWeekIndex: (index: number) => void;
  week: GradebookWeek | null;
  total: { earned: number; possible: number };
}) {
  const classDays = (week?.days ?? []).filter((day) => day.maxPoints > 0 || day.points !== null);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display-sm text-foreground">Participation</h1>
          <p className="text-xs text-muted-foreground">
            Use the week switcher. Official total {loading ? "…" : `${total.earned} / ${total.possible || "—"}`}.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-foreground/[0.08] bg-black/85 light:bg-muted p-1">
          <button
            type="button"
            disabled={weekIndex <= 0}
            onClick={() => onWeekIndex(Math.max(0, weekIndex - 1))}
            className="rounded-lg p-2 text-[var(--ink-text)] transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <label className="sr-only" htmlFor="grades-week-switcher">
            Week
          </label>
          <select
            id="grades-week-switcher"
            value={weekIndex}
            disabled={weeks.length === 0}
            onChange={(event) => onWeekIndex(Number(event.target.value))}
            className="max-w-[14rem] bg-transparent px-2 py-1 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground outline-none"
          >
            {weeks.length === 0 ? <option value={0}>No weeks yet</option> : null}
            {weeks.map((entry, index) => (
              <option key={entry.weekStart} value={index} className="bg-[var(--ink)] text-foreground">
                {entry.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={weekIndex >= weeks.length - 1}
            onClick={() => onWeekIndex(Math.min(weeks.length - 1, weekIndex + 1))}
            className="rounded-lg p-2 text-[var(--ink-text)] transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading participation...
        </div>
      ) : !week ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground">
          No participation weeks in this semester yet.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
            <div>
              <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {week.label}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {week.graded ? "Graded this week" : "Not graded yet"}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-extrabold italic">
                {week.graded ? `${week.earned} / ${week.possible}` : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {week.fullPossible > 0 ? `${week.fullPossible} pts possible` : "No class days"}
              </div>
            </div>
          </div>

          {classDays.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No class days this week.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {classDays.map((day) => (
                <div key={day.date} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {day.weekday} · {day.date.slice(5)}
                    </div>
                    <span className="meta-pill">
                      {day.kind === "PA"
                        ? "PA"
                        : day.kind === "SHOW"
                          ? "Show"
                          : day.kind === "HOLIDAY"
                            ? "Holiday"
                            : day.maxPoints > 0
                              ? "Class"
                              : "Off"}
                    </span>
                  </div>
                  <div className="mt-2 font-display text-2xl font-extrabold italic">
                    {day.points === null ? "—" : day.points}
                    <span className="text-sm text-muted-foreground"> / {day.maxPoints}</span>
                  </div>
                  {day.label ? <p className="mt-1 text-[11px] text-muted-foreground">{day.label}</p> : null}
                  {day.notes ? (
                    <p className="mt-2 text-xs text-foreground">
                      <span className="text-muted-foreground">Note · </span>
                      {day.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function OtherView({
  loading,
  livestreamPoints,
  livestreamHours,
  requiredHours,
  portfolioPoints,
  portfolioFeedback
}: {
  loading: boolean;
  livestreamPoints: number | null;
  livestreamHours: number;
  requiredHours: number;
  portfolioPoints: number | null;
  portfolioFeedback: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h1 className="display-sm text-foreground">Other</h1>
        <p className="text-xs text-muted-foreground">
          Livestream credit and the end-of-semester portfolio.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Livestreams
          </div>
          <div className="mt-2 font-display text-3xl font-extrabold italic">
            {loading ? "…" : livestreamPoints === null ? "—" : livestreamPoints}
            <span className="text-base text-muted-foreground"> / {MAX_LIVESTREAM_POINTS}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {livestreamHours}/{requiredHours} hours completed. Full credit is 8 hours
            (40 points, 5 per hour). Partial hours scale linearly.
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--brand-green)]"
              style={{ width: `${Math.min(100, (livestreamHours / Math.max(requiredHours, 1)) * 100)}%` }}
            />
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
          <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Portfolio
          </div>
          <div className="mt-2 font-display text-3xl font-extrabold italic">
            {loading ? "…" : portfolioPoints === null ? "—" : portfolioPoints}
            <span className="text-base text-muted-foreground"> / {MAX_PORTFOLIO_POINTS}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {portfolioPoints === null
              ? "Not graded yet. The 10% portfolio weight is dropped until it is marked."
              : "Counts as 10% of the semester grade."}
          </p>
          {portfolioFeedback.trim() ? (
            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-[hsl(var(--background))] p-3 text-sm">
              {portfolioFeedback}
            </p>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function CategoryCard({
  label,
  weight,
  earned,
  possible,
  loading,
  hint
}: {
  label: string;
  weight: string;
  earned: number;
  possible: number;
  loading: boolean;
  hint?: string;
}) {
  const pct = pctOf(earned, possible);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
        <span className="meta-pill">{weight}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-extrabold italic leading-none tracking-tight text-foreground">
        {loading ? "…" : possible > 0 ? `${earned} / ${possible}` : "—"}
      </div>
      <div className="mt-1 font-mono-broadcast text-xs text-[var(--brand-green)]">
        {pct === null ? "Not gradeable yet" : `${pct}% of category`}
      </div>
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
      {possible > 0 ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--brand-green)] transition-all"
            style={{ width: `${Math.min(100, (earned / possible) * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function PointsCell({
  label,
  value,
  max,
  dim
}: {
  label: string;
  value: number | null;
  max: number;
  dim: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--background))] p-3">
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-xl font-extrabold italic leading-none tracking-tight",
          dim ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value !== null ? (
          <>
            {value} <span className="text-sm text-muted-foreground">/ {max}</span>
          </>
        ) : (
          <span>— / {max}</span>
        )}
      </div>
    </div>
  );
}

