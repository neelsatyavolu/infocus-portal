"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject
} from "react";
import { CalendarDays, PanelRightOpen } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { isTypingTarget, useListHotkeys } from "@/components/kit/hotkeys";
import { IconButton } from "@/components/kit/icon-button";
import { useRememberedState } from "@/components/kit/remembered-state";
import { CalendarToolbar, MonthStatusTags } from "@/components/master-calendar/calendar-toolbar";
import { CastCountsDialog } from "@/components/master-calendar/cast-counts-dialog";
import {
  DAY_PANEL_ID,
  WEEK_LEGEND,
  buildDayModels,
  buildWeekSegments,
  defaultSelectedDate,
  formatShortDate,
  stepDay,
  summarizeMonth,
  type Anchor,
  type CalendarResponse
} from "@/components/master-calendar/calendar-model";
import { DayPanel, DockedDayPanel, DrawerDayPanel, SheetDayPanel } from "@/components/master-calendar/day-panel";
import { DayPanelSkeleton } from "@/components/master-calendar/day-panel-skeleton";
import type { DayEditActions } from "@/components/master-calendar/day-edit-sections";
import { runDayButtonId } from "@/components/master-calendar/holiday-run";
import { ImageMenu, type ImageMenuState } from "@/components/master-calendar/image-menu";
import { MonthBoard } from "@/components/master-calendar/month-board";
import { MonthStepper } from "@/components/master-calendar/month-stepper";
import { PackagePickerPopover } from "@/components/master-calendar/package-picker-popover";
import { PillRenamePopover } from "@/components/master-calendar/pill-rename-popover";
import { useMasterCalendar, useTodayKey } from "@/components/master-calendar/use-master-calendar";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/src/lib/utils";

type PanelPref = "docked" | "collapsed";
const isPanelPref = (value: unknown): value is PanelPref => value === "docked" || value === "collapsed";

/**
 * Workspace widths. The month board is a grid from 58rem of its own width (month-board.tsx) and an
 * agenda below. Wide (from that same 58rem): an open Day panel sits beside the board, never over
 * it: producers keep it docked (it can be hidden), viewers open it for a day. The board gives the
 * panel 21.25rem, so it is an agenda beside the panel (list and detail) until the workspace is
 * wide enough for both. Medium: the board is already an agenda, and the panel opens as a drawer
 * over its right edge. Narrow: it opens as a sheet over the page.
 */
const WIDE_REM = 58;
const MEDIUM_REM = 44;
type WorkspaceSize = "wide" | "medium" | "narrow";

type PackagePickerState = { dateKey: string; anchor: Anchor };
type PillRenameState = { dateKey: string; packageId: string; currentLabel: string; anchor: Anchor };

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The workspace's width class, measured before the first client paint (null on the server). */
function useWorkspaceSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<WorkspaceSize | null>(null);
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const update = () => {
      const rem = element.getBoundingClientRect().width / rootSize;
      setSize(rem >= WIDE_REM ? "wide" : rem >= MEDIUM_REM ? "medium" : "narrow");
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The day's visible button: its own cell or row, or its column in a grid run of days off. */
function dayButton(dateKey: string) {
  const own = document.getElementById(`master-calendar-day-${dateKey}`);
  if (own && own.getClientRects().length > 0) return own;
  return document.getElementById(runDayButtonId(dateKey)) ?? own;
}

function focusDayButton(dateKey: string | null) {
  if (!dateKey) return;
  window.requestAnimationFrame(() => dayButton(dateKey)?.focus({ preventScroll: true }));
}

function focusDayPanel() {
  window.requestAnimationFrame(() => document.getElementById(DAY_PANEL_ID)?.focus({ preventScroll: true }));
}

export default function MasterCalendarClient({
  initialData,
  todayKey: serverTodayKey = null
}: {
  initialData: CalendarResponse;
  /** Today in Pacific time, so the server's first paint and the client agree. */
  todayKey?: string | null;
}) {
  const cal = useMasterCalendar(initialData);
  const todayKey = useTodayKey(serverTodayKey);

  const days = useMemo(
    () =>
      buildDayModels({
        weeks: cal.weeks,
        entries: cal.entries,
        scheduleDays: cal.scheduleDays,
        queuedPackages: cal.queuedPackages,
        showManagers: cal.showManagers,
        todayKey,
        canEdit: cal.canEdit
      }),
    [cal.weeks, cal.entries, cal.scheduleDays, cal.queuedPackages, cal.showManagers, todayKey, cal.canEdit]
  );
  const dayByKey = useMemo(() => new Map(days.map((day) => [day.dateKey, day])), [days]);
  const rows = useMemo(() => buildWeekSegments(cal.weeks, dayByKey), [cal.weeks, dayByKey]);
  const summary = useMemo(() => summarizeMonth(days, todayKey), [days, todayKey]);

  // ---- Popovers and dialogs
  const [packagePicker, setPackagePicker] = useState<PackagePickerState | null>(null);
  const [pillRename, setPillRename] = useState<PillRenameState | null>(null);
  const [imageMenu, setImageMenu] = useState<ImageMenuState | null>(null);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [castCountsOpen, setCastCountsOpen] = useState(false);

  // ---- Selection: picked once per month (so it doesn't jump while producers fill a day)
  const [selection, setSelection] = useState(() => ({
    month: cal.monthKey,
    date: defaultSelectedDate(days, cal.monthKey, todayKey, cal.canEdit)
  }));
  if (selection.month !== cal.monthKey) {
    setSelection({ month: cal.monthKey, date: defaultSelectedDate(days, cal.monthKey, todayKey, cal.canEdit) });
    setImageMenu(null);
    setPackagePicker(null);
    setPillRename(null);
  }
  const selectedDate = selection.month === cal.monthKey ? selection.date : null;
  const selectedDay = selectedDate ? dayByKey.get(selectedDate) ?? null : null;

  // ---- Day panel placement. Producers dock it beside a wide board by default (they edit there);
  // viewers open a day on demand (the cells already show what the panel repeats). Each role's
  // choice is remembered on its own.
  const [panelPref, setPanelPref, panelPrefLoaded] = useRememberedState<PanelPref>(
    cal.canEdit ? "master-calendar:panel:v1" : "master-calendar:panel:viewer:v1",
    cal.canEdit ? "docked" : "collapsed",
    isPanelPref
  );
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const size = useWorkspaceSize(workspaceRef);
  // Docks only once the saved choice is read, so a hidden panel never flashes in first.
  const pinned = panelPrefLoaded && size === "wide" && panelPref === "docked";
  const [overlayOpen, setOverlayOpen] = useState(false);
  if (pinned && overlayOpen) setOverlayOpen(false);
  const panelOpen = size !== null && selectedDay !== null && (pinned || overlayOpen);
  // Wide: beside the board, docked or opened for a day, so it never covers grid columns.
  const dockedOpen = panelOpen && size === "wide";
  const drawerOpen = panelOpen && size === "medium";
  const sheetOpen = panelOpen && size === "narrow";
  // Until the saved choice is read (server HTML, first client frames), reserve the docked column
  // with CSS alone; it then fills in or folds away.
  const placeholderPanel = !panelPrefLoaded && panelPref === "docked";

  const selectDay = useCallback(
    (dateKey: string, fromKeyboard: boolean) => {
      setSelection({ month: dateKey.slice(0, 7), date: dateKey });
      if (pinned || overlayOpen) {
        // Enter or Space on a day: take keyboard users to its controls, not through the rest of the board.
        if (fromKeyboard) focusDayPanel();
        return;
      }
      setOverlayOpen(true);
      // Opening beside a wide board narrows it (often to the agenda), so keep the picked day in view.
      window.requestAnimationFrame(() => dayButton(dateKey)?.scrollIntoView({ block: "nearest" }));
    },
    [pinned, overlayOpen]
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = stepDay(days, selectedDate, direction);
      if (!next) return;
      setSelection({ month: next.slice(0, 7), date: next });
      dayButton(next)?.scrollIntoView({ block: "nearest" });
    },
    [days, selectedDate]
  );

  const closePanel = useCallback(() => {
    setOverlayOpen(false);
    focusDayButton(selectedDate);
  }, [selectedDate]);

  useListHotkeys({
    onNext: () => step(1),
    onPrevious: () => step(-1),
    enabled: panelOpen && !confirmingWipe && !castCountsOpen
  });

  // Esc closes a panel that was opened for a day, unless a popover, picker or dialog is taking it.
  useEffect(() => {
    if (!panelOpen || pinned) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || isTypingTarget(event.target)) return;
      if (packagePicker || pillRename || imageMenu) return;
      if (
        document.querySelector(
          "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']"
        )
      ) {
        return;
      }
      closePanel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, pinned, packagePicker, pillRename, imageMenu, closePanel]);

  const openImageMenu = useCallback((dateKey: string, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setImageMenu({ dateKey, x: event.clientX, y: event.clientY });
  }, []);
  const closeImageMenu = useCallback(() => setImageMenu(null), []);
  const closePackagePicker = useCallback(() => setPackagePicker(null), []);
  const closePillRename = useCallback(() => setPillRename(null), []);

  function handleToday() {
    if (cal.goToCurrentMonth()) return;
    // Already on this month: select today (or the next weekday) and bring it into view.
    const target = todayKey ? days.find((day) => day.dateKey >= todayKey) : undefined;
    if (!target) return;
    setSelection({ month: cal.monthKey, date: target.dateKey });
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    dayButton(target.dateKey)?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  const actions: DayEditActions = {
    saveShowAnchors: (dateKey, names, source) => void cal.saveShowAnchors(dateKey, names, source),
    randomizeShowAnchors: (dateKey) => void cal.randomizeShowAnchors(dateKey),
    saveShowManager: (dateKey, name) => void cal.saveShowManager(dateKey, name),
    savePaAnnouncers: (dateKey, names) => void cal.savePaAnnouncers(dateKey, names),
    randomizePaAnnouncers: (dateKey) => void cal.randomizePaAnnouncers(dateKey),
    saveCrew: (dateKey, role, names) => void cal.saveCrew(dateKey, role, names),
    toggleImage: (dateKey) => void cal.toggleImage(dateKey),
    commitNotes: cal.commitNotes,
    registerEditor: cal.registerEditor,
    openPackagePicker: (dateKey, anchor) => setPackagePicker({ dateKey, anchor }),
    openPillRename: (dateKey, pill, anchor) => {
      const packageId = pill.getAttribute("data-package-id") ?? "";
      if (!packageId) return;
      const currentLabel = pill.getAttribute("data-display-label") ?? pill.textContent ?? "";
      setPillRename({ dateKey, packageId, currentLabel, anchor });
    }
  };

  const panel =
    panelOpen && selectedDay ? (
      <DayPanel
        day={selectedDay}
        pinned={pinned}
        canEdit={cal.canEdit}
        saving={cal.savingDates.has(selectedDay.dateKey)}
        failure={cal.failedDates[selectedDay.dateKey] ?? null}
        busy={cal.castBusyDate === selectedDay.dateKey}
        wipingAnchors={cal.wipingAnchors}
        members={cal.castMembers}
        managerPool={cal.showManagerPool}
        hasPrevious={stepDay(days, selectedDay.dateKey, -1) !== null}
        hasNext={stepDay(days, selectedDay.dateKey, 1) !== null}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        onDismiss={pinned ? () => setPanelPref("collapsed") : closePanel}
        onDismissFailure={() => cal.clearFailed(selectedDay.dateKey)}
        actions={actions}
      />
    ) : null;

  // Failures the open Day panel isn't already showing (another day, or the panel is closed).
  const panelDate = panelOpen ? selectedDate : null;
  const otherFailures = Object.entries(cal.failedDates).filter(([dateKey]) => dateKey !== panelDate);
  const hasAlerts = Boolean(cal.message || cal.syncError) || otherFailures.length > 0;

  return (
    <div className="route-enter">
      {/* The phone sheet covers the page: what's behind it is inert, so Tab and screen readers stay in the sheet. */}
      <div className="space-y-5" inert={sheetOpen || undefined}>
        <PageHeader
          eyebrow={
            <>
              <CalendarDays className="h-3 w-3" aria-hidden />
              Run of show
            </>
          }
          status={cal.canEdit ? <MonthStatusTags summary={summary} syncState={cal.syncState} /> : null}
          title={
            <>
              <span className="sr-only">Master Calendar, </span>
              {cal.monthTitle}
            </>
          }
          description={WEEK_LEGEND}
          actions={
            <>
              <MonthStepper
                loading={cal.loading}
                previousDisabled={cal.atCalendarStart}
                onPrevious={() => cal.shiftMonth(-1)}
                onNext={() => cal.shiftMonth(1)}
                onToday={handleToday}
              />
              {panelPrefLoaded && size === "wide" && panelPref === "collapsed" ? (
                <IconButton label="Show day panel" icon={PanelRightOpen} variant="outline" onClick={() => setPanelPref("docked")} />
              ) : null}
            </>
          }
        />

        <CalendarToolbar
          summary={summary}
          loading={cal.loading}
          canEdit={cal.canEdit}
          canViewCastCounts={cal.canViewCastCounts}
          syncing={cal.syncing}
          wipingAnchors={cal.wipingAnchors}
          onOpenCastCounts={() => setCastCountsOpen(true)}
          onSync={cal.syncNow}
          onWipe={() => {
            cal.clearWipeError();
            setConfirmingWipe(true);
          }}
        />

        {hasAlerts ? (
          <div className="space-y-2">
            {cal.message ? (
              <Alert tone="danger" compact onDismiss={cal.clearMessage}>
                {cal.message}
              </Alert>
            ) : null}
            {cal.syncError ? (
              <Alert tone="danger" compact title="Couldn't sync to the Google Doc" onDismiss={cal.clearSyncError}>
                {cal.syncError}
              </Alert>
            ) : null}
            {otherFailures.map(([dateKey, failure]) => (
              <Alert
                key={dateKey}
                tone="danger"
                compact
                title={`${failure.kind === "save" ? "Couldn't save" : "Couldn't randomize"} ${formatShortDate(dateKey)}`}
                onDismiss={() => cal.clearFailed(dateKey)}
              >
                {failure.message}
              </Alert>
            ))}
          </div>
        ) : null}

        <div ref={workspaceRef} className="@container">
          <div
            className={cn(
              "grid items-start gap-5",
              dockedOpen && "grid-cols-[minmax(0,1fr)_20rem]",
              placeholderPanel && "@min-[58rem]:grid-cols-[minmax(0,1fr)_20rem]"
            )}
          >
            <MonthBoard
              rows={rows}
              loading={cal.loading}
              selectedDate={selectedDate}
              showSelection={panelOpen}
              canEdit={cal.canEdit}
              savingDates={cal.savingDates}
              failedDates={cal.failedDates}
              onSelect={selectDay}
              onImageMenu={openImageMenu}
            />
            {dockedOpen ? (
              <DockedDayPanel focusOnOpen={!pinned}>{panel}</DockedDayPanel>
            ) : placeholderPanel ? (
              <DayPanelSkeleton className="hidden @min-[58rem]:flex" />
            ) : null}
          </div>
        </div>
      </div>

      {drawerOpen ? <DrawerDayPanel>{panel}</DrawerDayPanel> : null}
      {sheetOpen ? <SheetDayPanel>{panel}</SheetDayPanel> : null}

      {cal.canEdit && imageMenu ? (
        <ImageMenu
          state={imageMenu}
          imageHidden={dayByKey.get(imageMenu.dateKey)?.imageHidden ?? false}
          onToggle={() => void cal.toggleImage(imageMenu.dateKey)}
          onClose={closeImageMenu}
        />
      ) : null}

      {cal.canEdit && packagePicker ? (
        <PackagePickerPopover
          anchor={packagePicker.anchor}
          onCancel={closePackagePicker}
          onSelect={(option) => {
            cal.insertPackagePill(option);
            setPackagePicker(null);
          }}
        />
      ) : null}

      {cal.canEdit && pillRename ? (
        <PillRenamePopover
          anchor={pillRename.anchor}
          initialLabel={pillRename.currentLabel}
          onSave={(label) => {
            cal.renamePill(pillRename.dateKey, pillRename.packageId, label);
            setPillRename(null);
          }}
          onRemove={() => {
            cal.removePill(pillRename.dateKey, pillRename.packageId);
            setPillRename(null);
          }}
          onCancel={closePillRename}
        />
      ) : null}

      {cal.canViewCastCounts ? <CastCountsDialog open={castCountsOpen} onOpenChange={setCastCountsOpen} /> : null}
      <ConfirmDialog
        open={confirmingWipe}
        onOpenChange={setConfirmingWipe}
        title={`Wipe all volunteer and random anchors for ${cal.monthTitle}?`}
        description="PA announcers stay. You can re-assign anchors after."
        confirmLabel="Wipe anchors"
        busyLabel="Wiping…"
        error={cal.wipeError}
        onConfirm={cal.wipeMonthAnchors}
      />
    </div>
  );
}
