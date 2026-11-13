"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Pencil, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/kit/alert";
import { ErrorState } from "@/components/kit/empty-state";
import { IconButton } from "@/components/kit/icon-button";
import { SectionHeader } from "@/components/kit/section";
import { Skeleton } from "@/components/kit/skeleton";
import { SaveState, StatusTag } from "@/components/kit/status-tag";
import { relativeDaysLabel } from "@/components/kit/tone";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { SEMESTER_TWO_CYCLE_NUMBERS, cycleSemesterTerm } from "@/src/lib/package-grades";
import {
  cycleFullLabel,
  dirtyCycleNumbers,
  editLayoutFrom,
  editRows,
  errorMessage,
  formatDateShort,
  hasAnyDate,
  isCycleClosed,
  orderCycles,
  pluralCycles,
  soonestDeadline,
  startOfToday,
  withSavedCycle,
  withServerCycles,
  withStageDate,
  type Deadline,
  type EditLayout,
  type PackageCycle,
  type PackageCyclesResponse,
  type Schedule,
  type StageKey
} from "./cycle-dates-utils";
import { CycleDatesColumns } from "./cycle-dates-columns";
import { CycleScheduleSkeleton } from "./cycle-dates-skeleton";
import { CycleEditor } from "./cycle-editor";
import { CycleSchedule } from "./cycle-schedule";
import { CycleWinners, hasWinners, releaseStateByCycle, useCycleWinners } from "./cycle-winners";
import { SemesterStrip } from "./semester-strip";

const CYCLES_CACHE_KEY = "package-cycles";
const CLOSE_NOTE = "Dates close at 11:59 PM Pacific.";

async function loadCycles() {
  const response = await fetch("/api/package-cycles", { cache: "no-store" });
  const payload = (await response.json()) as {
    data?: PackageCyclesResponse;
    error?: { message?: string };
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Failed to load package cycles.");
  }

  rememberValue(CYCLES_CACHE_KEY, payload.data);
  return payload.data;
}

/** "Cycle 2", "Cycle 1 and S2 Cycle 1", "Cycle 1, Cycle 2 and Cycle 3". */
function cycleList(numbers: number[]) {
  const labels = numbers.map(cycleFullLabel);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** The last semester 2 cycle; until the count reaches it, semester 2 shows only on this page. */
const LAST_S2_CYCLE_NUMBER = SEMESTER_TWO_CYCLE_NUMBERS[SEMESTER_TWO_CYCLE_NUMBERS.length - 1];

function inTerm<T>(items: readonly T[], cycleNumberOf: (item: T) => number, term: 1 | 2) {
  return items.filter((item) => cycleSemesterTerm(cycleNumberOf(item)) === term);
}

/** The header's one line: the soonest deadline across every open cycle. */
function summaryLine(cycles: PackageCycle[], today: Date, soonest: Deadline | null) {
  if (soonest) {
    return (
      <>
        Next: {cycleFullLabel(soonest.cycleNumber)} {soonest.stage.short} ·{" "}
        <span className="font-mono-broadcast text-[13px] tabular-nums">{formatDateShort(soonest.date, today)}</span> ·{" "}
        <span className="font-mono-broadcast text-[13px] tabular-nums">{relativeDaysLabel(soonest.days)}</span>
      </>
    );
  }
  if (cycles.length > 0 && cycles.every((cycle) => isCycleClosed(cycle, today))) return "All cycles have closed.";
  if (!hasAnyDate(cycles)) return "No dates set yet.";
  return "No upcoming dates set yet.";
}

export default function CycleDatesClient({ initialData }: { initialData: PackageCyclesResponse | null }) {
  // The server's copy (page.tsx) on the first frame; without it, the last copy, refreshed
  // quietly (src/lib/client-cache.ts).
  const [initial] = useState(() => initialData ?? cachedValue<PackageCyclesResponse>(CYCLES_CACHE_KEY));
  const [schedule, setSchedule] = useState<Schedule | null>(() => (initial ? withServerCycles(null, initial.cycles) : null));
  const [canEdit, setCanEdit] = useState(initial?.canEdit ?? false);
  const [canEditCycleCount, setCanEditCycleCount] = useState(initial?.canEditCycleCount ?? false);
  const [cyclesPerSemester, setCyclesPerSemester] = useState(initial?.cyclesPerSemester ?? 3);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLayout, setEditLayout] = useState<EditLayout>({ open: [], closed: [] });
  const [savingCycles, setSavingCycles] = useState<number[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { data: winners, releasing, setReleased } = useCycleWinners();
  const release = useMemo(
    () => ({ state: releaseStateByCycle(winners), busyCycle: releasing, onSet: (cycle: number, value: boolean) => void setReleased(cycle, value) }),
    [winners, releasing, setReleased]
  );

  const applyData = useCallback((data: PackageCyclesResponse) => {
    setSchedule((previous) => withServerCycles(previous, data.cycles));
    setCanEdit(data.canEdit);
    setCanEditCycleCount(data.canEditCycleCount);
    setCyclesPerSemester(data.cyclesPerSemester);
  }, []);

  useEffect(() => {
    if (initialData) {
      // Already fresh from the server: keep it as the last copy for a client-side return.
      rememberValue(CYCLES_CACHE_KEY, initialData);
      return;
    }
    let active = true;
    loadCycles()
      .then((data) => {
        if (active) applyData(data);
      })
      .catch((error: unknown) => {
        if (active) setPageError(errorMessage(error, "Failed to load package cycles."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialData, applyData]);

  async function refresh() {
    setRefreshing(true);
    try {
      applyData(await loadCycles());
      setPageError(null);
    } catch (error) {
      setPageError(errorMessage(error, "Failed to refresh package cycles."));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCountSaved(count: number) {
    setCyclesPerSemester(count);
    await refresh();
  }

  function updateDraft(cycleNumber: number, key: StageKey, value: string | null) {
    setSchedule((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((cycle) => (cycle.cycleNumber === cycleNumber ? withStageDate(cycle, key, value) : cycle))
          }
        : current
    );
  }

  function handleCycleSaved(result: PackageCycle, sent: PackageCycle) {
    setSchedule((current) => (current ? withSavedCycle(current, result, sent) : current));
  }

  function markSaving(cycleNumber: number, saving: boolean) {
    setSavingCycles((current) => {
      const others = current.filter((entry) => entry !== cycleNumber);
      return saving ? [...others, cycleNumber] : others;
    });
  }

  const todayTime = startOfToday().getTime();
  const today = useMemo(() => new Date(todayTime), [todayTime]);
  const saved = useMemo(() => schedule?.saved ?? [], [schedule]);
  const ordered = useMemo(() => orderCycles(saved, today), [saved, today]);
  const soonest = useMemo(() => soonestDeadline(saved, today), [saved, today]);
  const sections = useMemo(() => new Map(ordered.map((entry) => [entry.cycle.cycleNumber, entry.section])), [ordered]);
  const unsaved = schedule ? dirtyCycleNumbers(schedule.drafts, schedule.saved) : [];
  const stripShown = editing && canEditCycleCount && schedule !== null;

  function startEditing() {
    setEditLayout(editLayoutFrom(ordered));
    setEditing(true);
  }

  /** Waits for running saves (the button is disabled meanwhile), then asks before dropping drafts. */
  function finishEditing() {
    if (savingCycles.length > 0) return;
    if (unsaved.length > 0) setConfirmDiscard(true);
    else setEditing(false);
  }

  function discardDrafts() {
    setSchedule((current) => (current ? { ...current, drafts: current.saved } : current));
    setEditing(false);
  }

  /** One semester's schedule or editor (rows and order are shared, so cycles keep their sections). */
  function termBody(current: Schedule, term: 1 | 2) {
    if (editing && canEdit) {
      const rows = editRows(editLayout, current.drafts);
      const byNumber = (cycle: PackageCycle) => cycle.cycleNumber;
      return (
        <CycleEditor
          saved={current.saved}
          rows={{ open: inTerm(rows.open, byNumber, term), closed: inTerm(rows.closed, byNumber, term) }}
          sections={sections}
          today={today}
          savingCycles={savingCycles}
          onSavingChange={markSaving}
          onChange={updateDraft}
          onSaved={handleCycleSaved}
        />
      );
    }
    const termOrdered = inTerm(ordered, (entry) => entry.cycle.cycleNumber, term);
    return <CycleSchedule ordered={termOrdered} today={today} soonest={soonest} release={release} />;
  }

  let body;
  if (!schedule) {
    body = loading ? (
      <CycleScheduleSkeleton />
    ) : (
      <div className="rounded-md border border-border bg-card">
        <ErrorState
          size="page"
          title="Couldn't load cycle dates"
          message={pageError ?? undefined}
          onRetry={() => void refresh()}
          busy={refreshing}
        />
      </div>
    );
  } else {
    body = termBody(schedule, 1);
  }
  const semesterTwoHidden = cyclesPerSemester < LAST_S2_CYCLE_NUMBER;

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={
          <>
            <CalendarClock className="h-3 w-3" aria-hidden />
            Run of show
          </>
        }
        status={
          editing || unsaved.length > 0 ? (
            <>
              {editing ? <StatusTag tone="neutral">Editing</StatusTag> : null}
              {unsaved.length > 0 ? <SaveState state="dirty" count={unsaved.length} /> : null}
            </>
          ) : null
        }
        title="Cycle Dates"
        description={
          schedule ? (
            summaryLine(saved, today, soonest)
          ) : loading ? (
            <Skeleton className="inline-block h-3.5 w-72 max-w-full align-middle" />
          ) : undefined
        }
        actions={
          <>
            <IconButton
              label="Refresh"
              icon={RefreshCcw}
              variant="outline"
              busy={refreshing || loading}
              onClick={() => void refresh()}
            />
            {canEdit || canEditCycleCount ? (
              editing ? (
                <Button type="button" variant="outline" onClick={finishEditing} disabled={savingCycles.length > 0}>
                  <Check aria-hidden />
                  Done editing
                </Button>
              ) : (
                <Button type="button" onClick={startEditing}>
                  <Pencil aria-hidden />
                  Edit cycles
                </Button>
              )
            ) : null}
          </>
        }
      />

      {schedule && pageError ? (
        <Alert
          tone="danger"
          title="Couldn't refresh cycle dates."
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
              Try again
            </Button>
          }
        >
          {pageError}
        </Alert>
      ) : null}

      <CycleDatesColumns
        strip={stripShown ? <SemesterStrip savedCount={cyclesPerSemester} onSaved={handleCountSaved} /> : null}
        dates={
          <div className="space-y-8">
            <section aria-labelledby="stage-dates-title" className="space-y-3">
              <SectionHeader
                as="h2"
                id="stage-dates-title"
                title="Semester 1"
                // While the semester strip shows the count, the line doesn't repeat it.
                description={schedule && !stripShown ? `${pluralCycles(cyclesPerSemester)} this semester · ${CLOSE_NOTE}` : CLOSE_NOTE}
              />
              {body}
            </section>
            {schedule ? (
              <section aria-labelledby="semester-two-title" className="space-y-3">
                <SectionHeader
                  as="h2"
                  id="semester-two-title"
                  title="Semester 2"
                  description={
                    semesterTwoHidden
                      ? `Planned ahead. The rest of the Portal shows these cycles once the cycle count is ${LAST_S2_CYCLE_NUMBER}.`
                      : CLOSE_NOTE
                  }
                />
                {termBody(schedule, 2)}
              </section>
            ) : null}
          </div>
        }
        winners={hasWinners(winners) ? <CycleWinners data={winners} /> : null}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description={
          unsaved.length > 0
            ? `${cycleList(unsaved)} ${unsaved.length === 1 ? "has" : "have"} dates you haven't saved.`
            : "Some dates haven't been saved."
        }
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={discardDrafts}
      />
    </div>
  );
}
