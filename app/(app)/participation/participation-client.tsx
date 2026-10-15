"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, CalendarOff, MessageSquare, RotateCw, Save, Users } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { DateStepper } from "@/components/kit/button-group";
import { EmptyState } from "@/components/kit/empty-state";
import { useHotkeys } from "@/components/kit/hotkeys";
import { IconButton } from "@/components/kit/icon-button";
import { KeyHints, shortcutKeys } from "@/components/kit/kbd";
import { ActionMenu } from "@/components/kit/menu";
import { NameSortSelect } from "@/components/kit/pickers";
import { useMediaQuery, useRememberedState } from "@/components/kit/remembered-state";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Spinner } from "@/components/kit/spinner";
import { CountBadge, StatusTag } from "@/components/kit/status-tag";
import { StickyActionBar } from "@/components/kit/sticky-action-bar";
import { PageHeader } from "@/components/page-header";
import { isNameSortKey, nameSortMenuEntries, useIsApplePlatform, useMounted } from "@/components/people/people-ui";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { sumParticipationMax } from "@/src/lib/grading";
import { type NameSortKey, sortNamedPeople } from "@/src/lib/name-sort";
import { ParticipationCommentDialog } from "./participation-comment-dialog";
import { ParticipationDayList } from "./participation-day-list";
import { ParticipationGrid, type WeekGridProps } from "./participation-grid";
import { ParticipationPending } from "./participation-pending";
import { ParticipationToolbarSkeleton, ParticipationWeekSkeleton } from "./participation-skeleton";
import {
  WEEKDAY_LABELS,
  addDays,
  countChanges,
  dayColumns,
  defaultPhoneDay,
  entryKey,
  formatWeekLabel,
  offDayInUse,
  startOfWeek,
  toDateKey
} from "./participation-week";
import { useParticipationWeek } from "./use-participation-week";

type View = "week" | "pending";

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

/**
 * Participation (People hub): grade the week, clear the queue. Week view is the grid (lg) or a
 * day-at-a-time list (phones/tablets) with Save in a bar that stays in reach; Pending view is the
 * approval queue (the "Pending" control the approval rule refers to), fetched when it is opened.
 * Staff arrive here from the docked-score email.
 */
export default function ParticipationClient() {
  const mounted = useMounted();
  const apple = useIsApplePlatform();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const week = useParticipationWeek();
  const [view, setView] = useState<View>("week");
  const [sortBy, setSortBy, sortLoaded] = useRememberedState<NameSortKey>(
    "people:participation:sort:v1",
    "lastName",
    isNameSortKey
  );
  // The skeleton holds until the remembered sort is applied, so rows never reorder on screen.
  const ready = mounted && sortLoaded;
  const [noteTarget, setNoteTarget] = useState<{ userId: string; dateKey: string } | null>(null);
  const [phoneDay, setPhoneDay] = useState<string | null>(null);
  const [pendingWeek, setPendingWeek] = useState<Date | null>(null);
  // Off days (max 0: Wed/Fri shows, holidays) are hidden unless they hold something; this shows
  // them all, with a score field and comment in every cell as the old grid had (a 0 there lets a
  // comment post on that day).
  const [showOffDays, setShowOffDays] = useState(false);
  const { data, drafts, baseline, weekStart, loadQueue } = week;

  const todayKey = mounted ? toDateKey(new Date()) : "";
  const isCurrentWeek = mounted && week.weekStartKey === toDateKey(startOfWeek(new Date()));

  const students = useMemo(() => sortNamedPeople(data?.students ?? [], sortBy), [data, sortBy]);
  const studentIds = useMemo(() => students.map((student) => student.id), [students]);
  const days = useMemo(
    () => dayColumns(weekStart, data?.maxPointsByDate ?? [], todayKey),
    [weekStart, data, todayKey]
  );
  const columns = useMemo(
    () =>
      days.filter(
        (day) =>
          day.graded ||
          (day.max !== null && (showOffDays || offDayInUse(day.dateKey, studentIds, drafts, baseline)))
      ),
    [days, studentIds, drafts, baseline, showOffDays]
  );
  const offDayLabels = days
    .filter((day) => day.max === 0)
    .map((day) => `${WEEKDAY_LABELS[day.date.getDay()]} ${day.date.getDate()}`);
  const scheduleKnown = days.every((day) => day.max !== null);
  // Finals week, holidays, summer: every day is worth 0.
  const noClassDays = scheduleKnown && days.every((day) => !day.graded);
  const weekPossible = useMemo(() => sumParticipationMax(data?.maxPointsByDate ?? []), [data]);
  const pendingByKey = useMemo(
    () => new Map((data?.pendingItems ?? []).map((item) => [entryKey(item.userId, item.date), item])),
    [data]
  );
  const changes = useMemo(() => countChanges(drafts, baseline), [drafts, baseline]);
  const dirtyCount = changes.unsaved + changes.orphanNotes;
  const pendingTotal = week.pendingCount;
  const phoneDayKey =
    phoneDay && columns.some((column) => column.dateKey === phoneDay)
      ? phoneDay
      : defaultPhoneDay(columns, todayKey, isCurrentWeek);
  const canSave = Boolean(data) && !week.saving && !week.refreshing;
  const saveShortcut = shortcutKeys("mod+s", apple);

  function save() {
    // Saving from the Pending view refreshes the queue on screen too.
    void week.save({ reloadQueue: view === "pending" });
  }

  function changeView(next: View) {
    setView(next);
    if (next === "pending") void loadQueue();
  }

  function requestWeek(target: Date) {
    if (toDateKey(startOfWeek(target)) === week.weekStartKey) return;
    if (dirtyCount > 0) setPendingWeek(target);
    else week.changeWeek(target);
  }

  function shiftWeek(weeks: number) {
    requestWeek(addDays(weekStart, weeks * 7));
  }

  useHotkeys({ "[": () => shiftWeek(-1), "]": () => shiftWeek(1) }, { enabled: mounted && view === "week" });

  const saveRef = useRef({ canSave, save });
  useEffect(() => {
    saveRef.current = { canSave, save };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (saveRef.current.canSave) saveRef.current.save();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const gridProps: WeekGridProps = {
    students,
    columns,
    allDays: days,
    offDayLabels,
    drafts,
    baseline,
    pendingByKey,
    weekPossible,
    onSetPoints: week.setPoints,
    onFillDay: (dateKey) => week.fillDay(dateKey, studentIds),
    onFillWeek: (userId) => week.fillWeek(userId, showOffDays),
    onOpenComment: (userId, dateKey) => setNoteTarget({ userId, dateKey })
  };

  const noteStudent = noteTarget ? students.find((student) => student.id === noteTarget.userId) : null;
  const noteDay = noteTarget ? (days.find((day) => day.dateKey === noteTarget.dateKey)?.date ?? null) : null;
  const noteKey = noteTarget ? entryKey(noteTarget.userId, noteTarget.dateKey) : "";

  // Every pending request (data.pendingCount, including 0), amber whenever there are any — the
  // number the old Pending button showed. It comes with every week load, so Save, Approve and Deny
  // refresh it.
  const pendingBadge =
    pendingTotal === null ? null : (
      <CountBadge
        count={pendingTotal}
        showZero
        tone={view === "pending" ? "onBrand" : pendingTotal > 0 ? "warning" : "neutral"}
        srLabel={`${pendingTotal} pending`}
      />
    );

  const barStatus = (
    // The kit bar truncates its status line; this wraps instead, so the comment warning is never cut off.
    <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 whitespace-normal">
      {week.saving ? (
        <StatusTag tone="neutral" spinner>
          Saving…
        </StatusTag>
      ) : week.refreshing ? (
        <StatusTag tone="neutral" spinner>
          Refreshing…
        </StatusTag>
      ) : changes.unsaved > 0 ? (
        <StatusTag tone="warning">
          {changes.unsaved} unsaved {plural(changes.unsaved, "change", "changes")}
        </StatusTag>
      ) : (
        <span>No unsaved changes</span>
      )}
      {changes.orphanNotes > 0 && !week.saving ? (
        <StatusTag
          tone="warning"
          icon={MessageSquare}
          title="A comment only saves with a score. Enter a score for that day, or clear the comment."
        >
          {changes.orphanNotes} {plural(changes.orphanNotes, "comment won't", "comments won't")} save
        </StatusTag>
      ) : null}
      {view === "week" ? (
        <KeyHints
          items={[
            { keys: ["[", "]"], label: "Week" },
            { keys: saveShortcut, label: "Save" }
          ]}
        />
      ) : null}
    </span>
  );
  // Desktop Week view: always, so Save is always in reach (it sits in the page flow). Phones and
  // tablets, where the bar is fixed over the rows, and the Pending view: only while there is
  // something to save or a save/refresh to report.
  const barVisible =
    Boolean(data) &&
    (isDesktop
      ? view === "week" || dirtyCount > 0 || week.saving
      : dirtyCount > 0 || week.saving || week.refreshing);

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow="Classroom · 35% of grade"
        title="Participation"
        description="Full marks post now. Docked scores wait for the adviser or another producer to approve."
      />

      {!ready ? (
        <>
          <ParticipationToolbarSkeleton />
          <ParticipationWeekSkeleton />
        </>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl<View>
              ariaLabel="View"
              size="touch"
              value={view}
              onChange={changeView}
              className="max-lg:flex max-lg:flex-1 max-lg:*:flex-1"
              options={[
                { value: "week", label: "Week" },
                {
                  value: "pending",
                  label: (
                    <>
                      Pending
                      {pendingBadge}
                    </>
                  )
                }
              ]}
            />
            {view === "week" ? (
              <>
                <ActionMenu
                  label="Sort students"
                  triggerIcon={ArrowUpDown}
                  variant="outline"
                  className="h-10 md:h-9 lg:hidden"
                  items={nameSortMenuEntries(sortBy, setSortBy)}
                />
                {/* Phones: the stepper fills its own row, the week label taking the spare width. */}
                <div className="max-lg:order-last max-lg:basis-full max-lg:[&>div]:flex max-lg:[&>div]:w-full max-lg:[&>div>div:first-child]:flex-1">
                  <DateStepper
                    size="touch"
                    label={formatWeekLabel(weekStart)}
                    onPrevious={() => shiftWeek(-1)}
                    onNext={() => shiftWeek(1)}
                    previousLabel="Previous week"
                    nextLabel="Next week"
                    onReset={() => requestWeek(new Date())}
                    resetLabel="This week"
                    isCurrent={isCurrentWeek}
                    labelClassName="flex-1"
                  />
                </div>
                <span aria-hidden className="hidden flex-1 lg:block" />
                {/* Always in the row (no shift while the week loads); idle on a week with no off days. */}
                <IconButton
                  label="Show off days"
                  icon={CalendarOff}
                  variant="outline"
                  size="touch"
                  pressed={showOffDays}
                  disabled={Boolean(data) && offDayLabels.length === 0}
                  onClick={() => setShowOffDays((current) => !current)}
                />
                <NameSortSelect value={sortBy} onChange={setSortBy} ariaLabel="Sort students" className="hidden w-40 lg:flex" />
              </>
            ) : null}
          </div>

          {view === "week" ? (
            <>
              {!data && week.loadError ? (
                <Alert
                  tone="danger"
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={() => void week.reload()} disabled={week.fetching}>
                      {week.fetching ? <Spinner /> : <RotateCw aria-hidden />}
                      Try again
                    </Button>
                  }
                >
                  {week.loadError}
                </Alert>
              ) : null}
              {data && students.length > 0 && noClassDays && columns.length > 0 ? (
                <Alert tone="info" icon={CalendarOff}>
                  No class days to grade this week.
                </Alert>
              ) : null}
              {data && !scheduleKnown ? (
                <Alert
                  tone="warning"
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={() => void week.reload()} disabled={week.fetching}>
                      {week.fetching ? <Spinner /> : <RotateCw aria-hidden />}
                      Try again
                    </Button>
                  }
                >
                  Couldn&apos;t read the class schedule for every day this week.
                </Alert>
              ) : null}

              {week.loading ? (
                <ParticipationWeekSkeleton />
              ) : !data ? null : students.length === 0 ? (
                <div className="rounded-md border border-border bg-card">
                  <EmptyState
                    icon={Users}
                    title="No students found."
                    description="Executives, the adviser and super admin aren't graded."
                  />
                </div>
              ) : columns.length === 0 ? (
                scheduleKnown ? (
                  <div className="rounded-md border border-border bg-card">
                    <EmptyState
                      icon={CalendarOff}
                      title="No class days to grade this week."
                      description="Every day is off: shows, holidays, finals or summer break."
                      action={
                        <Button type="button" variant="outline" onClick={() => setShowOffDays(true)}>
                          <CalendarOff aria-hidden />
                          Show off days
                        </Button>
                      }
                    />
                  </div>
                ) : null
              ) : isDesktop ? (
                <ParticipationGrid {...gridProps} />
              ) : (
                <ParticipationDayList {...gridProps} dayKey={phoneDayKey} onDayChange={setPhoneDay} />
              )}
            </>
          ) : (
            <ParticipationPending
              queue={week.queue}
              loading={week.queueLoading}
              error={week.queueError}
              onRetry={() => void loadQueue()}
              decidingId={week.decidingId}
              onDecide={(requestId, approved) => void week.decide(requestId, approved)}
              wide={isDesktop}
            />
          )}

          <StickyActionBar mode="sticky" visible={barVisible} status={barStatus}>
            {/* Filled only when there is something to save; it stays clickable either way. */}
            <Button
              type="button"
              variant={dirtyCount > 0 ? "default" : "outline"}
              onClick={save}
              disabled={!canSave}
              title={`Save (${saveShortcut.join(apple ? "" : "+")})`}
              aria-keyshortcuts={apple ? "Meta+S" : "Control+S"}
            >
              {week.saving ? <Spinner /> : <Save aria-hidden />}
              Save
            </Button>
          </StickyActionBar>
        </>
      )}

      <ParticipationCommentDialog
        open={Boolean(noteTarget)}
        studentName={noteStudent?.name ?? noteStudent?.email ?? "Student"}
        day={noteDay}
        points={noteTarget ? drafts.points[noteKey] : undefined}
        max={noteTarget ? week.maxFor(noteTarget.dateKey) : 0}
        note={drafts.notes[noteKey] ?? ""}
        onChange={(note) => {
          if (noteTarget) week.setNote(noteTarget.userId, noteTarget.dateKey, note);
        }}
        onClose={() => setNoteTarget(null)}
      />

      <ConfirmDialog
        open={pendingWeek !== null}
        onOpenChange={(open) => {
          if (!open) setPendingWeek(null);
        }}
        title={`Discard ${dirtyCount} unsaved ${plural(dirtyCount, "change", "changes")}?`}
        description="This week has changes that aren't saved yet. Switching weeks drops them."
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        onConfirm={() => {
          if (pendingWeek) week.changeWeek(pendingWeek);
        }}
      />
    </div>
  );
}
