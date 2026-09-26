"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Edit3, RefreshCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

type PackageCycle = {
  cycleNumber: number;
  focus: string;
  pitchingDate: string | null;
  proofOfContactDate: string | null;
  aRollBRollDate: string | null;
  initialCutDate: string | null;
  finalCutDate: string | null;
};

type PackageCyclesResponse = {
  canEdit: boolean;
  canEditCycleCount: boolean;
  cyclesPerSemester: number;
  cycles: PackageCycle[];
};

const BUTTON_PRIMARY =
  "bg-primary text-primary-foreground hover:bg-primary/90";
const BUTTON_SECONDARY =
  "bg-secondary text-foreground hover:bg-accent";
const BUTTON_WARNING =
  "bg-amber-500/20 border border-amber-300/40 text-amber-100 hover:bg-amber-500/30";

const MIN_CYCLES = 1;
const MAX_CYCLES = 8;

const DEFAULT_CYCLES: PackageCycle[] = [
  { cycleNumber: 1, focus: "", pitchingDate: null, proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: null },
  { cycleNumber: 2, focus: "", pitchingDate: null, proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: null },
  { cycleNumber: 3, focus: "", pitchingDate: null, proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: null }
];

const STAGE_FIELDS = [
  { key: "pitchingDate", label: "Package Pitching" },
  { key: "proofOfContactDate", label: "Brainstorming & Proof of Contact" },
  { key: "aRollBRollDate", label: "A-roll/B-roll" },
  { key: "initialCutDate", label: "Initial Cut" },
  { key: "finalCutDate", label: "Final Cut" }
] as const;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateKey(dateKey: string | null) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(dateKey: string | null) {
  const date = parseDateKey(dateKey);
  if (!date) return "TBD";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function cycleName(cycleNumber: number, anchorDate?: string | null) {
  if (!anchorDate) return `Cycle ${cycleNumber}`;
  const parsed = parseDateKey(anchorDate);
  if (!parsed) return `Cycle ${cycleNumber}`;
  const month = parsed.toLocaleDateString("en-US", { month: "long" });
  return `Cycle ${cycleNumber} · ${month}`;
}

function daysUntil(dateKey: string | null) {
  const date = parseDateKey(dateKey);
  if (!date) return null;
  const today = startOfToday();
  const diffMs = date.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getNextStage(cycle: PackageCycle) {
  const today = startOfToday();

  const candidates = STAGE_FIELDS.map((stage) => {
    const parsed = parseDateKey(cycle[stage.key]);
    return {
      stage: stage.label,
      date: parsed
    };
  }).filter((candidate) => candidate.date && candidate.date.getTime() >= today.getTime()) as Array<{
    stage: string;
    date: Date;
  }>;

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime());
  return candidates[0];
}

function isCyclePassed(cycle: PackageCycle) {
  const finalCut = parseDateKey(cycle.finalCutDate);
  if (!finalCut) return false;
  const today = startOfToday();
  return finalCut.getTime() < today.getTime();
}

async function loadCycles() {
  const response = await fetch("/api/package-cycles", { cache: "no-store" });
  const payload = (await response.json()) as {
    data?: PackageCyclesResponse;
    error?: { message?: string };
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load package cycles.");
  }

  return payload.data;
}

function applyLoadedCycles(data: PackageCyclesResponse) {
  const sorted = [...data.cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
  return {
    sorted,
    canEdit: data.canEdit,
    canEditCycleCount: data.canEditCycleCount,
    cyclesPerSemester: data.cyclesPerSemester
  };
}

export default function PackageCyclesPage() {
  const [cycles, setCycles] = useState<PackageCycle[]>(DEFAULT_CYCLES);
  const [formCycles, setFormCycles] = useState<PackageCycle[]>(DEFAULT_CYCLES);
  const [canEdit, setCanEdit] = useState(false);
  const [canEditCycleCount, setCanEditCycleCount] = useState(false);
  const [cyclesPerSemester, setCyclesPerSemester] = useState(3);
  const [cycleCountDraft, setCycleCountDraft] = useState(3);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingCycle, setSavingCycle] = useState<number | null>(null);
  const [savingCycleCount, setSavingCycleCount] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function applyData(data: PackageCyclesResponse) {
    const loaded = applyLoadedCycles(data);
    setCycles(loaded.sorted);
    setFormCycles(loaded.sorted);
    setCanEdit(loaded.canEdit);
    setCanEditCycleCount(loaded.canEditCycleCount);
    setCyclesPerSemester(loaded.cyclesPerSemester);
    setCycleCountDraft(loaded.cyclesPerSemester);
  }

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        setLoading(true);
        setMessage(null);
        const data = await loadCycles();
        if (!active) return;
        applyData(data);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Failed to load package cycles.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  const orderedCycles = useMemo(() => {
    const passed = cycles.filter(isCyclePassed).sort((a, b) => a.cycleNumber - b.cycleNumber);
    const nonPassed = cycles.filter((cycle) => !isCyclePassed(cycle)).sort((a, b) => a.cycleNumber - b.cycleNumber);
    const current = nonPassed[0] ?? null;
    const upcoming = current ? nonPassed.slice(1) : nonPassed;
    const output: Array<PackageCycle & { section: "current" | "upcoming" | "passed" }> = [];

    if (current) {
      output.push({ ...current, section: "current" });
    }

    for (const cycle of upcoming) {
      output.push({ ...cycle, section: "upcoming" });
    }

    for (const cycle of passed) {
      output.push({ ...cycle, section: "passed" });
    }

    return output;
  }, [cycles]);

  function updateFormCycle(cycleNumber: number, field: keyof PackageCycle, value: string | null) {
    setFormCycles((current) =>
      current.map((cycle) =>
        cycle.cycleNumber === cycleNumber
          ? {
              ...cycle,
              [field]: value
            }
          : cycle
      )
    );
  }

  async function saveCycleCount() {
    const next = Math.min(MAX_CYCLES, Math.max(MIN_CYCLES, Math.trunc(cycleCountDraft) || MIN_CYCLES));
    if (next === cyclesPerSemester) {
      setCycleCountDraft(next);
      return;
    }

    try {
      setSavingCycleCount(true);
      setMessage(null);

      const response = await fetch("/api/platform/program-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cyclesPerSemester: next })
      });

      const payload = (await response.json()) as {
        data?: { cyclesPerSemester: number };
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to update cycle count.");
      }

      const data = await loadCycles();
      applyData(data);
      setMessage(`Semester now has ${payload.data.cyclesPerSemester} package cycle${payload.data.cyclesPerSemester === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update cycle count.");
      setCycleCountDraft(cyclesPerSemester);
    } finally {
      setSavingCycleCount(false);
    }
  }

  async function saveCycle(cycleNumber: number) {
    const cycle = formCycles.find((entry) => entry.cycleNumber === cycleNumber);
    if (!cycle) return;

    try {
      setSavingCycle(cycleNumber);
      setMessage(null);

      const response = await fetch("/api/package-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cycle)
      });

      const payload = (await response.json()) as {
        data?: PackageCycle;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to save cycle.");
      }

      setCycles((current) =>
        current
          .map((entry) => (entry.cycleNumber === cycleNumber ? payload.data! : entry))
          .sort((a, b) => a.cycleNumber - b.cycleNumber)
      );
      setFormCycles((current) =>
        current
          .map((entry) => (entry.cycleNumber === cycleNumber ? payload.data! : entry))
          .sort((a, b) => a.cycleNumber - b.cycleNumber)
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save cycle.");
    } finally {
      setSavingCycle(null);
    }
  }

  return (
    <div className="route-enter mx-auto w-full max-w-6xl space-y-5">
      <section className="brand-hero-panel relative overflow-hidden rounded-2xl border border-border p-5 md:p-6">
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <CalendarClock className="h-3 w-3" />
              Production · Run-of-Show
            </div>
            <h1 className="display-md mt-2 text-foreground">Package Cycles</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ordered by current cycle, upcoming cycles, then passed cycles.
              {!loading ? ` · ${cyclesPerSemester} cycle${cyclesPerSemester === 1 ? "" : "s"} this semester` : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className={BUTTON_SECONDARY}
              onClick={() => {
                void loadCycles()
                  .then((data) => {
                    applyData(data);
                  })
                  .catch((error) => {
                    setMessage(error instanceof Error ? error.message : "Failed to refresh package cycles.");
                  });
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {canEdit || canEditCycleCount ? (
              <Button
                type="button"
                size="sm"
                className={editing ? BUTTON_WARNING : BUTTON_PRIMARY}
                onClick={() => {
                  setEditing((current) => {
                    if (current) {
                      setCycleCountDraft(cyclesPerSemester);
                    }
                    return !current;
                  });
                }}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {editing ? "Done Editing" : "Edit Cycles"}
              </Button>
            ) : null}
          </div>
        </div>

        {editing && canEditCycleCount ? (
          <div className="relative mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3">
            <div className="min-w-0">
              <label htmlFor="cycles-per-semester" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Cycles this semester
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Changes how many cycle cards appear here and in grades. Extra cycle data is kept if you lower the count.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                id="cycles-per-semester"
                type="number"
                min={MIN_CYCLES}
                max={MAX_CYCLES}
                value={cycleCountDraft}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) {
                    setCycleCountDraft(MIN_CYCLES);
                    return;
                  }
                  setCycleCountDraft(Math.min(MAX_CYCLES, Math.max(MIN_CYCLES, Math.trunc(value))));
                }}
                className="h-10 w-20 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">cycles</span>
              <Button
                type="button"
                size="sm"
                className={BUTTON_PRIMARY}
                disabled={savingCycleCount || cycleCountDraft === cyclesPerSemester}
                onClick={() => void saveCycleCount()}
              >
                <Save className="mr-2 h-4 w-4" />
                {savingCycleCount ? "Saving..." : "Save count"}
              </Button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{message}</p>
        ) : null}
      </section>

      {loading ? (
        <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading package cycles...
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {orderedCycles.map((cycle) => {
            const formCycle = formCycles.find((entry) => entry.cycleNumber === cycle.cycleNumber) ?? cycle;
            const sectionPillCls =
              cycle.section === "current"
                ? "status-approved"
                : cycle.section === "upcoming"
                  ? "status-warn"
                  : "status-neutral";
            const sectionLabel =
              cycle.section === "current" ? "Active" : cycle.section === "upcoming" ? "Planned" : "Closed";
            const cycleAnchor = cycle.proofOfContactDate ?? cycle.finalCutDate;

            // Find the next not-yet-complete stage with a date ahead of today
            const nextStage = STAGE_FIELDS.find((stage) => {
              const dateKey = formCycle[stage.key];
              const parsed = parseDateKey(dateKey);
              if (!parsed) return false;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return parsed.getTime() >= today.getTime();
            });

            return (
              <article
                key={cycle.cycleNumber}
                className={cn(
                  "rounded-2xl border bg-card p-5 md:p-6",
                  cycle.section === "current"
                    ? "border-[rgb(43,179,110,0.30)]"
                    : cycle.section === "upcoming"
                      ? "border-border"
                      : "border-border opacity-90"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="display-sm text-foreground">
                      {cycleName(cycle.cycleNumber, cycleAnchor)}
                    </h2>
                  </div>
                  <span className={`status-pill ${sectionPillCls}`}>{sectionLabel}</span>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  {STAGE_FIELDS.map((stage) => {
                    const stageDate = formCycle[stage.key];
                    const parsed = parseDateKey(stageDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isPast = parsed ? parsed.getTime() < today.getTime() : false;
                    const dotCls = !parsed
                      ? "bg-[var(--ink-4)]"
                      : isPast
                        ? "bg-[var(--brand-green)]"
                        : "bg-[var(--brand-amber)]";
                    const statusLabel = !parsed
                      ? "TBD"
                      : isPast
                        ? "Completed"
                        : (() => {
                            const diff = Math.round(
                              (parsed.getTime() - today.getTime()) / 86_400_000
                            );
                            return `in ${diff}d`;
                          })();
                    const statusCls = !parsed
                      ? "status-neutral"
                      : isPast
                        ? "status-approved"
                        : "status-warn";

                    return (
                      <div
                        key={`${cycle.cycleNumber}-${stage.key}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-[hsl(var(--background))] px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", dotCls)} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">{stage.label}</div>
                            {editing && canEdit ? (
                              <input
                                type="date"
                                value={stageDate ?? ""}
                                onChange={(event) =>
                                  updateFormCycle(
                                    cycle.cycleNumber,
                                    stage.key as keyof PackageCycle,
                                    event.target.value ? event.target.value : null
                                  )
                                }
                                className="mt-1 h-7 w-full rounded-md border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:ring-ring"
                              />
                            ) : (
                              <div className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">
                                {formatDate(stageDate) || "—"}
                                {parsed
                                  ? ` · ${parsed.toLocaleDateString("en-US", { weekday: "short" })}`
                                  : ""}
                              </div>
                            )}
                          </div>
                        </div>
                        {!editing ? (
                          <span className={`status-pill ${statusCls}`}>{statusLabel}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {!editing && nextStage && cycle.section !== "passed" ? (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[rgb(43,179,110,0.30)] bg-[rgb(43,179,110,0.06)] px-4 py-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-green)]">
                        Next Stage
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {nextStage.label} · {formatDate(formCycle[nextStage.key])}
                      </div>
                    </div>
                    <span className="status-pill status-warn">
                      {(() => {
                        const parsed = parseDateKey(formCycle[nextStage.key]);
                        if (!parsed) return "TBD";
                        const diff = Math.round(
                          (parsed.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000
                        );
                        return diff === 0 ? "today" : `in ${diff}d`;
                      })()}
                    </span>
                  </div>
                ) : null}

                {editing && canEdit ? (
                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      className={BUTTON_PRIMARY}
                      disabled={savingCycle === cycle.cycleNumber}
                      onClick={() => void saveCycle(cycle.cycleNumber)}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingCycle === cycle.cycleNumber ? "Saving..." : "Save Cycle"}
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
