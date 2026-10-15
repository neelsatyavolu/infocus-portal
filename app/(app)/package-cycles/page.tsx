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
import {
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
import { CycleWinners, hasWinners, useCycleWinners } from "./cycle-winners";
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

/** "Cycle 2", "Cycles 1 and 2", "Cycles 1, 2 and 3". */
function cycleList(numbers: number[]) {
  if (numbers.length === 1) return `Cycle ${numbers[0]}`;
  return `Cycles ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** The header's one line: the soonest deadline across every open cycle. */
function summaryLine(cycles: PackageCycle[], today: Date, soonest: Deadline | null) {
  if (soonest) {
    return (
      <>
        Next: Cycle {soonest.cycleNumber} {soonest.stage.short} ·{" "}
        <span className="font-mono-broadcast text-[13px] tabular-nums">{formatDateShort(soonest.date, today)}</span> ·{" "}
        <span className="font-mono-broadcast text-[13px] tabular-nums">{relativeDaysLabel(soonest.days)}</span>
      </>
    );
  }
  if (cycles.length > 0 && cycles.every((cycle) => isCycleClosed(cycle, today))) return "All cycles have closed.";
  if (!hasAnyDate(cycles)) return "No dates set yet.";
  return "No upcoming dates set yet.";
}

export default function PackageCyclesPage() {
  // Show the last copy on the first frame and refresh it quietly (src/lib/client-cache.ts).
  const [initial] = useState(() => cachedValue<PackageCyclesResponse>(CYCLES_CACHE_KEY));
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
  const winners = useCycleWinners();

  const applyData = useCallback((data: PackageCyclesResponse) => {
    setSchedule((previous) => withServerCycles(previous, data.cycles));
    setCanEdit(data.canEdit);
    setCanEditCycleCount(data.canEditCycleCount);
    setCyclesPerSemester(data.cyclesPerSemester);
  }, []);

  useEffect(() => {
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
  }, [applyData]);

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
  } else if (editing && canEdit) {
    body = (
      <CycleEditor
        saved={schedule.saved}
        rows={editRows(editLayout, schedule.drafts)}
        sections={sections}
        today={today}
        savingCycles={savingCycles}
        onSavingChange={markSaving}
        onChange={updateDraft}
        onSaved={handleCycleSaved}
      />
    );
  } else {
    body = <CycleSchedule ordered={ordered} today={today} soonest={soonest} />;
  }

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
          <section aria-labelledby="stage-dates-title" className="space-y-3">
            <SectionHeader
              as="h2"
              id="stage-dates-title"
              title="Stage dates"
              // While the semester strip shows the count, the line doesn't repeat it.
              description={schedule && !stripShown ? `${pluralCycles(cyclesPerSemester)} this semester · ${CLOSE_NOTE}` : CLOSE_NOTE}
            />
            {body}
          </section>
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
