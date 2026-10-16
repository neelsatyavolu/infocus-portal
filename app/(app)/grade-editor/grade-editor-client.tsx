"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, SearchX, Users } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { useHydrated } from "@/components/project-assets/use-hydrated";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { rovingIndex } from "@/components/kit/roving";
import { ListDetailSkeleton } from "@/components/kit/skeleton";
import type { SaveStateValue } from "@/components/kit/status-tag";
import { ViewTabPanel, ViewTabs } from "@/components/kit/view-tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { pacificDateKey } from "@/src/lib/deadlines";
import { buildCycleGradesCsv, buildTotalGradesCsv, defaultTotalsAdjustments } from "@/src/lib/grade-editor-csv";
import { neighborIds } from "@/src/lib/keyboard-nav";
import { cn } from "@/src/lib/utils";
import type { CycleFilter, CycleTab, ViewMode } from "./grade-editor-types";
import {
  cycleFilterCounts,
  cycleFilterMatches,
  hasTemporaryEdits,
  latestPassedCycle,
  matchesSearch,
  missingCountsByCycle,
  notEnteredIdsForCycle,
  parseViewKey,
  sortByName,
  totalsRowSummary,
  viewKey
} from "./grade-editor-utils";
import { readStoredView, useGradeEditorPrefs, writeStoredView } from "./use-grade-editor-prefs";
import { useCycleGrades } from "./use-cycle-grades";
import { useGradeTotals } from "./use-grade-totals";
import { useMissingReport } from "./use-missing-report";
import { useExcludedPeople } from "./use-excluded-people";
import { GradeEditorHeader, type CycleStats } from "./grade-editor-header";
import { CycleFilterRow, GradeEditorToolbar, Legend } from "./grade-editor-toolbar";
import { CycleGradesTable, type CycleRowHandlers, type CycleRowState } from "./cycle-grades-table";
import { CycleGradesList } from "./cycle-grades-list";
import { TotalsGradesTable, type TotalsRowHandlers, type TotalsRowView } from "./totals-grades-table";
import { TotalsGradesList } from "./totals-grades-list";
import GradeEditorLoading from "./loading";

const StudentGradebookPanel = dynamic(() => import("./student-gradebook-panel").then((m) => m.StudentGradebookPanel), {
  ssr: false,
  loading: () => <ListDetailSkeleton />
});
const MissingGradesSheet = dynamic(() => import("./missing-grades-sheet").then((m) => m.MissingGradesSheet), { ssr: false });
const CycleRowSheet = dynamic(() => import("./cycle-row-sheet").then((m) => m.CycleRowSheet), { ssr: false });
const TotalsRowSheet = dynamic(() => import("./totals-row-sheet").then((m) => m.TotalsRowSheet), { ssr: false });
const FeedbackDialog = dynamic(() => import("./grade-editor-dialogs").then((m) => m.FeedbackDialog), { ssr: false });
const PublishHistoryDialog = dynamic(() => import("./grade-editor-dialogs").then((m) => m.PublishHistoryDialog), { ssr: false });
const ExtensionExceptionDialog = dynamic(() => import("./grade-editor-dialogs").then((m) => m.ExtensionExceptionDialog), { ssr: false });
const TotalNotesDialog = dynamic(() => import("./grade-editor-dialogs").then((m) => m.TotalNotesDialog), { ssr: false });
const ExtensionDepletedDialog = dynamic(() => import("./grade-editor-dialogs").then((m) => m.ExtensionDepletedDialog), { ssr: false });

const TAB_ID_PREFIX = "grade-editor";

const FILTER_EMPTY: Record<Exclude<CycleFilter, "all">, string> = {
  "to-publish": "Nothing unpublished. All caught up.",
  "not-entered": "Every reporter has a score.",
  missed: "No missed Final Cuts.",
  republish: "No revised grades waiting to be published again.",
  "over-extensions": "No one is over their extensions."
};

function downloadFile(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Manual activation for the view tabs: ←/→/Home/End only move focus and Enter or Space opens the
 * focused tab, as the old buttons did. Opening a cycle loads its rows (and may ask to discard
 * unsaved edits), so arrowing across the strip must not open every cycle on the way. This capture
 * handler runs before ViewTabs' own key handler and stops it.
 */
function moveViewTabFocus(event: KeyboardEvent<HTMLDivElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const index = tabs.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  const next = rovingIndex(index, event.key, tabs.map((tab) => tab.disabled));
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  tabs[next]?.focus();
}

export default function GradeEditorClient() {
  const [cycles, setCycles] = useState<CycleTab[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("total");
  /** Mounted and the remembered view read (the server render can't read it). */
  const [viewReady, setViewReady] = useState(false);
  /**
   * First visit (no remembered view): the page opens on Total grade at once, then moves to the
   * cycle being graded when the first totals (and so the cycles) arrive, unless a view was picked.
   */
  const [autoOpen, setAutoOpen] = useState(false);
  /** The cycle the page is opening on (remembered or auto-opened), until its rows have loaded. */
  const [openingCycle, setOpeningCycle] = useState<number | null>(null);
  /** Today in Pacific time when the page opened, for picking the cycle being graded. */
  const [openedOn] = useState(() => pacificDateKey(new Date()));
  const hydrated = useHydrated();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentRefreshToken, setStudentRefreshToken] = useState(0);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [feedbackModalUserId, setFeedbackModalUserId] = useState<string | null>(null);
  // Kept from before the redesign: nothing sets an id yet, so the dialog stays closed.
  const [extensionNoteUserId, setExtensionNoteUserId] = useState<string | null>(null);
  const [publicationHistoryUserId, setPublicationHistoryUserId] = useState<string | null>(null);
  const [totalsNotesUserId, setTotalsNotesUserId] = useState<string | null>(null);
  const [sheetUserId, setSheetUserId] = useState<string | null>(null);
  const [missingOpen, setMissingOpen] = useState(false);
  const [snapshotNonce, setSnapshotNonce] = useState(0);
  const [filterSnapshot, setFilterSnapshot] = useState<{ filter: CycleFilter; ids: ReadonlySet<string> } | null>(null);
  /** The tables need a laptop-wide window; phones and tablets get the row lists and sheets (40px controls). */
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const { sortBy, setSortBy, cycleFilter, setCycleFilter } = useGradeEditorPrefs();
  const { excludedIds, toggleExcluded, isExcluded } = useExcludedPeople();
  const missing = useMissingReport();
  const totals = useGradeTotals({ setMessage, onCycles: setCycles });
  const grades = useCycleGrades({
    setMessage,
    onCycles: setCycles,
    onCheckInSaved: totals.markCheckInStale,
    onRowChanged: missing.patchMissing
  });

  // First load: last-seen data at once, then the remembered view (Total grade on a first visit,
  // see autoOpen). The missing report loads in the background: it powers the counts on the
  // Missing grades button, the cycle tabs and the Not entered chip.
  useEffect(() => {
    const hadCache = totals.hydrateFromCache();
    missing.hydrateFromCache();
    void missing.loadMissing();
    void totals.loadTotals(hadCache ? { silent: true } : undefined);
    // Runs once on mount, like the original first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The remembered view, read once storage is readable (after hydration).
  if (hydrated && !viewReady) {
    setViewReady(true);
    const stored = readStoredView();
    if (stored) {
      setViewMode(stored.viewMode);
      if (stored.viewMode === "cycle" && stored.cycleNumber !== null) setOpeningCycle(stored.cycleNumber);
    } else {
      setAutoOpen(true);
    }
  }

  // Decides once, when the first totals (and cycles) arrive.
  if (autoOpen && totals.totalsSettled) {
    setAutoOpen(false);
    const gradingCycle = latestPassedCycle(cycles, openedOn);
    if (gradingCycle !== null) {
      setViewMode("cycle");
      setOpeningCycle(gradingCycle);
    }
  }

  // Loads the cycle the page opened on. Until it has loaded (or failed), the stored view is left
  // alone, so it never records the default cycle in between.
  useEffect(() => {
    if (openingCycle === null) return;
    void grades.loadCycle(openingCycle).finally(() => setOpeningCycle(null));
    // Only when the opening cycle is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingCycle]);

  useEffect(() => {
    if (viewReady && !autoOpen && openingCycle === null && grades.pendingCycleNumber === null) {
      writeStoredView(viewKey(viewMode, grades.activeCycleNumber));
    }
  }, [viewReady, autoOpen, openingCycle, viewMode, grades.activeCycleNumber, grades.pendingCycleNumber]);

  // Fresh cycle rows (a cycle opened, or Refresh): fetch the missing report again, so the Not
  // entered chip and the counts match the rows (another producer may have changed grades).
  useEffect(() => {
    if (grades.loadVersion > 0) void missing.loadMissing({ reuseInFlight: true });
    // Only when fresh rows land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades.loadVersion]);

  // The loaded cycle (its rows are on screen) and the one the tab shows: a different cycle while
  // its rows load. The header and the locked notice follow the tab; row controls follow the rows.
  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.cycleNumber === grades.activeCycleNumber) ?? null,
    [cycles, grades.activeCycleNumber]
  );
  const activeCycleHasFinalCut = Boolean(activeCycle?.finalCutDate);
  const activeCycleAverage = grades.cycleAverages.find((entry) => entry.cycleNumber === grades.activeCycleNumber) ?? null;
  const shownCycleNumber = grades.pendingCycleNumber ?? grades.activeCycleNumber;
  const shownCycle = cycles.find((cycle) => cycle.cycleNumber === shownCycleNumber) ?? null;
  /** Another cycle's rows are loading: the rows on screen are the old cycle's. */
  const switchingCycle = grades.pendingCycleNumber !== null && grades.pendingCycleNumber !== grades.activeCycleNumber;

  const sortedRows = useMemo(() => sortByName(grades.rows, sortBy), [grades.rows, sortBy]);
  const sortedTotalsRows = useMemo(() => sortByName(totals.totalsRows, sortBy), [totals.totalsRows, sortBy]);
  const totalsByUserId = useMemo(() => new Map(totals.totalsRows.map((row) => [row.userId, row] as const)), [totals.totalsRows]);
  // The Student list sorts itself (its own name order, unchanged from before).
  const studentPeople = useMemo(
    () => totals.totalsRows.map((row) => ({ userId: row.userId, name: row.name, email: row.email })),
    [totals.totalsRows]
  );

  const notEnteredIds = useMemo(() => {
    const report = missing.missingData;
    if (!report || !report.consideredCycleNumbers.includes(grades.activeCycleNumber)) return null;
    return notEnteredIdsForCycle(report, grades.activeCycleNumber);
  }, [missing.missingData, grades.activeCycleNumber]);
  const notEnteredReady = notEnteredIds !== null;
  const filterCounts = useMemo(() => cycleFilterCounts(grades.rows, notEnteredIds), [grades.rows, notEnteredIds]);
  // Published, scored grades: exempt and ungraded are left out, as the server's count does.
  const publishedCount = useMemo(() => grades.rows.filter((row) => row.published && !row.finalCutState).length, [grades.rows]);

  // A chip snapshots which rows match, so a row doesn't vanish while someone works on it.
  // It is re-taken when the chip is clicked again, fresh rows load, or the missing report
  // (which narrows Not entered to people on this cycle) arrives.
  // Taken while rendering, whenever one of those changes (adjusting state when its inputs change).
  const snapshotKey = `${cycleFilter}|${grades.loadVersion}|${snapshotNonce}|${notEnteredReady}`;
  const [snapshotTakenFor, setSnapshotTakenFor] = useState<string | null>(null);
  if (snapshotTakenFor !== snapshotKey) {
    setSnapshotTakenFor(snapshotKey);
    setFilterSnapshot(
      cycleFilter === "all"
        ? null
        : {
            filter: cycleFilter,
            ids: new Set(grades.rows.filter((row) => cycleFilterMatches(row, cycleFilter, notEnteredIds)).map((row) => row.userId))
          }
    );
  }

  const visibleRows = useMemo(() => {
    // Until the snapshot for this chip is taken (the first render after a click), match live.
    const snapshot = filterSnapshot?.filter === cycleFilter ? filterSnapshot.ids : null;
    return sortedRows.filter(
      (row) =>
        matchesSearch(row, search) &&
        (cycleFilter === "all" || (snapshot ? snapshot.has(row.userId) : cycleFilterMatches(row, cycleFilter, notEnteredIds)))
    );
  }, [sortedRows, search, cycleFilter, filterSnapshot, notEnteredIds]);

  const allTotalsViews = useMemo<TotalsRowView[]>(
    () =>
      sortedTotalsRows.map((row) => {
        const stored = totals.totalsAdjustments.get(row.userId);
        const adjustments = stored ?? defaultTotalsAdjustments();
        return {
          row,
          adjustments,
          summary: totalsRowSummary(row, adjustments, totals.checkInPossible, cycles.length),
          edited: hasTemporaryEdits(row, stored)
        };
      }),
    [sortedTotalsRows, totals.totalsAdjustments, totals.checkInPossible, cycles.length]
  );
  const visibleTotalsViews = useMemo(() => allTotalsViews.filter((view) => matchesSearch(view.row, search)), [allTotalsViews, search]);
  const temporaryEdits = useMemo(() => allTotalsViews.filter((view) => view.edited).length, [allTotalsViews]);

  const missingByCycle = useMemo(() => missingCountsByCycle(missing.missingData, excludedIds), [missing.missingData, excludedIds]);
  const missingPeople = useMemo(
    () => (missing.missingData ? missing.missingData.missingReport.filter((person) => !excludedIds.includes(person.userId)).length : null),
    [missing.missingData, excludedIds]
  );

  function selectFilter(next: CycleFilter) {
    setCycleFilter(next);
    setSnapshotNonce((value) => value + 1);
  }

  /**
   * Save all and Publish all work through the loaded cycle's rows one request at a time, so no
   * other cycle opens until they finish (its tab and Open cycle are disabled with this reason).
   */
  function cycleSwitchBlockedReason(cycleNumber: number): string | null {
    if (!(grades.savingAll || grades.publishingAll) || cycleNumber === grades.activeCycleNumber) return null;
    return `Wait for ${grades.publishingAll ? "Publish all" : "Save all"} to finish`;
  }

  function goToCycle(cycleNumber: number, filter?: CycleFilter) {
    if (cycleSwitchBlockedReason(cycleNumber)) return;
    const inCycleViewWithRows = viewMode === "cycle" && grades.rows.length > 0;
    const sameCycle = cycleNumber === grades.activeCycleNumber && grades.rows.length > 0;
    if (inCycleViewWithRows && sameCycle && grades.pendingCycleNumber === null) {
      if (filter) selectFilter(filter);
      return;
    }
    if (grades.rows.length > 0 && !sameCycle && grades.hasUnsavedChanges) {
      const proceed = window.confirm("You have unsaved changes. Switch cycle and discard them?");
      if (!proceed) return;
    }
    if (filter) selectFilter(filter);
    setAutoOpen(false);
    setViewMode("cycle");
    setSheetUserId(null);
    // Coming back to the same cycle with edits still saving, or while Save all / Publish all runs
    // on it: keep the rows instead of reloading. If another cycle is loading meanwhile (its switch
    // already confirmed), reload this one instead, which also stops the other from landing.
    const keepRows = grades.hasUnsavedChanges || grades.savingAll || grades.publishingAll;
    if (sameCycle && keepRows && grades.pendingCycleNumber === null) return;
    void grades.loadCycle(cycleNumber, inCycleViewWithRows || sameCycle ? { silent: true } : undefined);
  }

  function goToTotal() {
    setAutoOpen(false);
    setViewMode("total");
    setSheetUserId(null);
    void totals.loadTotals({ silent: true });
  }

  function goToStudentView(userId?: string) {
    const inCycleViewWithRows = viewMode === "cycle" && grades.rows.length > 0;
    if (inCycleViewWithRows && grades.hasUnsavedChanges) {
      const proceed = window.confirm("You have unsaved changes. Switch view and discard them?");
      if (!proceed) return;
    }
    setAutoOpen(false);
    setViewMode("student");
    setSheetUserId(null);
    if (userId) setSelectedStudentId(userId);
    if (totals.totalsRows.length === 0) {
      void totals.loadTotals({ silent: true });
    }
  }

  function selectView(key: string) {
    const parsed = parseViewKey(key);
    if (!parsed) return;
    if (parsed.viewMode === "cycle" && parsed.cycleNumber !== null) goToCycle(parsed.cycleNumber);
    else if (parsed.viewMode === "total") goToTotal();
    else goToStudentView();
  }

  function refresh() {
    if (viewMode === "cycle") {
      if (grades.hasUnsavedChanges && !window.confirm("You have unsaved changes. Refresh and discard them?")) return;
      void grades.reloadCycle({ silent: true });
    } else {
      void totals.loadTotals({ silent: true });
      void missing.loadMissing();
      if (viewMode === "student") setStudentRefreshToken((value) => value + 1);
    }
  }

  function openMissing() {
    setMissingOpen(true);
    void missing.loadMissing({ reuseInFlight: true });
  }

  async function publishAll() {
    await grades.publishAllFilledRows();
    void missing.loadMissing();
  }

  function downloadCsv() {
    if (viewMode === "total") {
      downloadFile(
        "total-grades.csv",
        buildTotalGradesCsv({
          cycles,
          checkInPossible: totals.checkInPossible,
          rows: sortedTotalsRows.map((row) => ({
            name: row.name,
            email: row.email,
            participationEarned: row.participationEarned,
            participationPossible: row.participationPossible,
            cycleTotals: row.cycleTotals,
            checkInPossible: row.checkInPossible,
            adjustments: totals.getAdjustments(row.userId)
          }))
        })
      );
      return;
    }
    downloadFile(
      `package-cycle-${grades.activeCycleNumber}-grades.csv`,
      buildCycleGradesCsv({ cycleNumber: grades.activeCycleNumber, rows: sortedRows })
    );
  }

  function rowSaveState(userId: string): SaveStateValue {
    if (grades.savingUserId === userId) return "saving";
    const dirty = grades.dirtyUserIds.has(userId);
    if (dirty && grades.failedUserId === userId) return "error";
    return dirty ? "dirty" : "saved";
  }

  const pageSaveState: SaveStateValue =
    grades.savingAll || grades.savingUserId !== null
      ? "saving"
      : grades.failedUserId !== null && grades.dirtyUserIds.has(grades.failedUserId)
        ? "error"
        : grades.hasUnsavedChanges
          ? "dirty"
          : "saved";

  const rowState: CycleRowState = {
    dirtyUserIds: grades.dirtyUserIds,
    savingUserId: grades.savingUserId,
    failedUserId: grades.failedUserId,
    publishingUserId: grades.publishingUserId,
    savingAll: grades.savingAll,
    publishingAll: grades.publishingAll,
    savingCheckIn: grades.savingCheckIn,
    locked: !activeCycleHasFinalCut
  };
  const cycleHandlers: CycleRowHandlers = {
    onOpenStudent: (userId) => goToStudentView(userId),
    onUpdateRow: grades.updateRowAndAutosave,
    onSaveCheckIn: (userId, stage, value) => void grades.saveCheckIn(userId, stage, value),
    onTogglePublish: (userId) => void grades.togglePublish(userId),
    onOpenFeedback: setFeedbackModalUserId,
    onOpenHistory: setPublicationHistoryUserId
  };
  const totalsHandlers: TotalsRowHandlers = {
    onOpenStudent: (userId) => goToStudentView(userId),
    onUpdateAdjustment: totals.updateAdjustment,
    onOpenNotes: setTotalsNotesUserId
  };

  // Switching cycles keeps the old rows on screen but not editable; a Refresh of the same cycle
  // leaves them editable, as before. Both show the progress line.
  const rowsInert = switchingCycle && grades.rows.length > 0;
  const panelBusy = viewMode === "cycle" ? grades.pendingCycleNumber !== null && grades.rows.length > 0 : totals.totalsRefreshing;
  const cycleLoading = grades.pendingCycleNumber !== null;
  // While a first visit decides its view, the Total table stays a skeleton, so its rows don't
  // flash before the page moves to the cycle being graded.
  const totalsTableLoading = totals.totalsLoading || autoOpen;

  const cycleStats: CycleStats | null =
    viewMode === "cycle" && !switchingCycle && grades.rows.length > 0
      ? {
          reporterCount: grades.rows.length,
          publishedCount,
          averageTotal: activeCycleAverage?.averageTotal ?? null,
          averagePercentage: activeCycleAverage?.averagePercentage ?? null,
          overExtensions: filterCounts["over-extensions"]
        }
      : null;

  function emptyNode() {
    const all = viewMode === "cycle" ? grades.rows.length : totals.totalsRows.length;
    if (all === 0 && message) {
      return <ErrorState title="Couldn't load grades" message="The reason is shown above." onRetry={refresh} busy={panelBusy} />;
    }
    if (all === 0) {
      return (
        <EmptyState icon={Users} title="No reporters to grade yet" description="Executives, the adviser and the super admin are not graded." />
      );
    }
    if (search.trim()) {
      return (
        <EmptyState
          size="inline"
          icon={SearchX}
          title={`No reporters match "${search.trim()}"`}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        size="inline"
        icon={CheckCircle2}
        title={cycleFilter === "all" ? "No reporters to show." : FILTER_EMPTY[cycleFilter]}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => selectFilter("all")}>
            Show all
          </Button>
        }
      />
    );
  }

  const tabValue = viewMode === "cycle" ? `cycle:${shownCycleNumber}` : viewMode;
  const tabItems = [
    ...cycles.map((cycle) => {
      const count = missingByCycle.get(cycle.cycleNumber) ?? 0;
      const blockedReason = cycleSwitchBlockedReason(cycle.cycleNumber);
      return {
        value: `cycle:${cycle.cycleNumber}`,
        label: `Cycle ${cycle.cycleNumber}`,
        title: blockedReason ?? (cycle.focus?.trim() || undefined),
        disabled: blockedReason !== null,
        count,
        countTone: "warning" as const,
        countLabel: `${count} ${count === 1 ? "person" : "people"} missing or unpublished`
      };
    }),
    { value: "total", label: "Total grade" },
    { value: "student", label: "Student" }
  ];

  const feedbackRow = grades.rows.find((row) => row.userId === feedbackModalUserId) ?? null;
  const historyRow = grades.rows.find((row) => row.userId === publicationHistoryUserId) ?? null;
  const extensionNoteRow = grades.rows.find((row) => row.userId === extensionNoteUserId) ?? null;
  const notesView = allTotalsViews.find((view) => view.row.userId === totalsNotesUserId) ?? null;
  const sheetRow = viewMode === "cycle" ? (grades.rows.find((row) => row.userId === sheetUserId) ?? null) : null;
  const sheetTotalsView = viewMode === "total" ? (allTotalsViews.find((view) => view.row.userId === sheetUserId) ?? null) : null;
  const sheetOrder = viewMode === "cycle" ? visibleRows.map((row) => row.userId) : visibleTotalsViews.map((view) => view.row.userId);
  const sheetNeighbors = sheetUserId ? neighborIds(sheetOrder, sheetUserId) : { previous: null, next: null };
  const stepSheet = (id: string | null) => (id ? () => setSheetUserId(id) : null);
  const selectedStudent = totalsByUserId.get(selectedStudentId ?? "") ?? null;

  if (!viewReady) return <GradeEditorLoading />;

  const tableView = viewMode !== "student";

  return (
    <div
      className={cn(
        "route-enter flex min-w-0 flex-col gap-5",
        tableView && "lg:h-[calc(100dvh-var(--app-header-h,4rem)-3rem)] lg:min-h-[36rem]"
      )}
    >
      <div className="shrink-0" onKeyDownCapture={moveViewTabFocus}>
        <ViewTabs ariaLabel="Grade Editor views" idPrefix={TAB_ID_PREFIX} value={tabValue} onChange={selectView} items={tabItems} />
      </div>

      <ViewTabPanel
        idPrefix={TAB_ID_PREFIX}
        value={tabValue}
        active
        className={cn("flex min-w-0 flex-col gap-5", tableView && "lg:min-h-0 lg:flex-1")}
      >
        <GradeEditorHeader
          viewMode={viewMode}
          cycleNumber={shownCycleNumber}
          cycle={shownCycle}
          stats={cycleStats}
          totalsReporterCount={totals.totalsRows.length}
          totalsLoading={totalsTableLoading && totals.totalsRows.length === 0}
          cycleCount={cycles.length}
          saveState={pageSaveState}
          dirtyCount={grades.dirtyUserIds.size}
          temporaryEdits={temporaryEdits}
          student={selectedStudent}
          missingPeople={missingPeople}
          onOpenMissing={openMissing}
          publishAllCount={filterCounts["to-publish"]}
          publishingAll={grades.publishingAll}
          publishAllDisabled={filterCounts["to-publish"] === 0 || grades.loading || grades.busy || cycleLoading}
          onPublishAll={() => void publishAll()}
        />

        {viewMode === "student" ? (
          <>
            {message ? (
              <Alert tone="danger" onDismiss={() => setMessage(null)}>
                {message}
              </Alert>
            ) : null}
            <StudentGradebookPanel
              people={studentPeople}
              selectedUserId={selectedStudentId}
              onSelectUserId={setSelectedStudentId}
              sortBy={sortBy}
              onSortChange={setSortBy}
              refreshToken={studentRefreshToken}
              onRefresh={refresh}
              refreshing={totals.totalsRefreshing}
              loading={(totals.totalsLoading || !totals.totalsSettled) && studentPeople.length === 0}
            />
          </>
        ) : (
          <section
            aria-label={viewMode === "cycle" ? "Cycle grades" : "Total grades"}
            className="relative flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card lg:min-h-0 lg:flex-1"
          >
            {panelBusy ? (
              <span aria-hidden className="absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-[var(--ink-3)]">
                <span className="block h-full w-1/3 bg-[var(--brand-fill)] motion-safe:animate-[loading-bar_1s_ease-in-out_infinite]" />
              </span>
            ) : null}
            <div className="shrink-0 space-y-3 border-b border-border p-4">
              <GradeEditorToolbar
                viewMode={viewMode}
                search={search}
                onSearchChange={setSearch}
                searchRef={searchRef}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onRefresh={refresh}
                refreshing={panelBusy}
                refreshDisabled={grades.busy}
                onDownloadCsv={downloadCsv}
                csvDisabled={viewMode === "total" ? totals.totalsLoading : grades.loading}
                dirtyCount={grades.dirtyUserIds.size}
                savingAll={grades.savingAll}
                saveAllDisabled={grades.dirtyUserIds.size === 0 || grades.loading || grades.busy || cycleLoading}
                onSaveAll={() => void grades.saveAllRows()}
              />
              {viewMode === "cycle" ? (
                <CycleFilterRow value={cycleFilter} onChange={selectFilter} counts={filterCounts} size={isDesktop ? "sm" : "touch"} />
              ) : null}
              {message ? (
                <Alert tone="danger" compact onDismiss={() => setMessage(null)}>
                  {message}
                </Alert>
              ) : null}
              {viewMode === "cycle" && shownCycle && !shownCycle.finalCutDate ? (
                <Alert
                  tone="warning"
                  compact
                  action={
                    <Link href="/package-cycles" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Open Cycle Dates
                    </Link>
                  }
                >
                  Turned in dates unlock once this cycle has a Final Cut date.
                </Alert>
              ) : null}
            </div>

            {/* The table's scroll box: from lg the page is held to the window and this box is the
                only thing that scrolls. Phones and tablets show the row lists, so only the page scrolls. */}
            <div className="min-h-0 min-w-0 flex-1 overflow-auto lg:overscroll-contain">
              {viewMode === "cycle" ? (
                isDesktop ? (
                  <CycleGradesTable
                    rows={visibleRows}
                    state={rowState}
                    handlers={cycleHandlers}
                    participationByUserId={totalsByUserId}
                    loading={grades.loading}
                    inert={rowsInert}
                    empty={emptyNode()}
                  />
                ) : (
                  <CycleGradesList
                    rows={visibleRows}
                    dirtyUserIds={grades.dirtyUserIds}
                    savingUserId={grades.savingUserId}
                    failedUserId={grades.failedUserId}
                    participationByUserId={totalsByUserId}
                    loading={grades.loading}
                    inert={rowsInert}
                    empty={emptyNode()}
                    onOpenRow={setSheetUserId}
                  />
                )
              ) : isDesktop ? (
                <TotalsGradesTable
                  views={visibleTotalsViews}
                  cycles={cycles}
                  handlers={totalsHandlers}
                  loading={totalsTableLoading}
                  empty={emptyNode()}
                />
              ) : (
                <TotalsGradesList views={visibleTotalsViews} loading={totalsTableLoading} empty={emptyNode()} onOpenRow={setSheetUserId} />
              )}
            </div>
            {isDesktop ? <Legend viewMode={viewMode} /> : null}
          </section>
        )}
      </ViewTabPanel>

      {missingOpen ? (
        <MissingGradesSheet
          open
          onOpenChange={setMissingOpen}
          data={missing.missingData}
          loading={missing.missingLoading}
          error={missing.missingError}
          excludedIds={excludedIds}
          isExcluded={isExcluded}
          toggleExcluded={toggleExcluded}
          openCycleBlockedReason={cycleSwitchBlockedReason}
          onOpenCycle={(cycleNumber, hasNotEntered) => {
            setMissingOpen(false);
            goToCycle(cycleNumber, hasNotEntered ? "not-entered" : "to-publish");
          }}
        />
      ) : null}

      {sheetRow ? (
        <CycleRowSheet
          row={sheetRow}
          cycleNumber={grades.activeCycleNumber}
          state={rowState}
          handlers={cycleHandlers}
          participation={totalsByUserId.get(sheetRow.userId) ?? null}
          feedbackState={rowSaveState(sheetRow.userId)}
          onClose={() => setSheetUserId(null)}
          onPrevious={stepSheet(sheetNeighbors.previous)}
          onNext={stepSheet(sheetNeighbors.next)}
          onOpenGradebook={() => goToStudentView(sheetRow.userId)}
        />
      ) : null}

      {sheetTotalsView ? (
        <TotalsRowSheet
          view={sheetTotalsView}
          notesState={totals.notesState[sheetTotalsView.row.userId] ?? "idle"}
          onUpdateAdjustment={totals.updateAdjustment}
          onUpdateNotes={totals.updateNotes}
          onClose={() => setSheetUserId(null)}
          onPrevious={stepSheet(sheetNeighbors.previous)}
          onNext={stepSheet(sheetNeighbors.next)}
          onOpenGradebook={() => goToStudentView(sheetTotalsView.row.userId)}
        />
      ) : null}

      {feedbackRow ? (
        <FeedbackDialog
          row={feedbackRow}
          cycleNumber={grades.activeCycleNumber}
          saveState={rowSaveState(feedbackRow.userId)}
          onChange={(feedback) => grades.updateRowAndAutosave(feedbackRow.userId, { feedback })}
          onClose={() => setFeedbackModalUserId(null)}
        />
      ) : null}

      {historyRow ? (
        <PublishHistoryDialog row={historyRow} cycleNumber={grades.activeCycleNumber} onClose={() => setPublicationHistoryUserId(null)} />
      ) : null}

      {extensionNoteRow ? (
        <ExtensionExceptionDialog
          row={extensionNoteRow}
          cycleNumber={grades.activeCycleNumber}
          finalCutDate={activeCycle?.finalCutDate ?? null}
          onClose={() => setExtensionNoteUserId(null)}
        />
      ) : null}

      {notesView ? (
        <TotalNotesDialog
          row={notesView.row}
          notes={notesView.adjustments.notes}
          saveState={totals.notesState[notesView.row.userId] ?? "idle"}
          onChange={(notes) => totals.updateNotes(notesView.row.userId, notes)}
          onClose={() => setTotalsNotesUserId(null)}
        />
      ) : null}

      {grades.extensionDepletedWarning ? (
        <ExtensionDepletedDialog warning={grades.extensionDepletedWarning} onClose={grades.dismissExtensionDepletedWarning} />
      ) : null}
    </div>
  );
}
