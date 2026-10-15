"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { ErrorState } from "@/components/kit/empty-state";
import { useHotkeys } from "@/components/kit/hotkeys";
import { useRememberedState } from "@/components/kit/remembered-state";
import { Spinner } from "@/components/kit/spinner";
import { ViewTabPanel, ViewTabs } from "@/components/kit/view-tabs";
import { Button } from "@/components/ui/button";
import type { EventContext } from "./event-parts";
import { EventEditor, type EditorTarget } from "./event-editor";
import { CompletionView } from "./completion-view";
import { LivestreamsHeader } from "./livestreams-header";
import {
  allowedViews,
  needsCompletion,
  scheduleFilterOptions,
  VIEW_TITLES,
  type EventRow,
  type ScheduleFilter,
  type View
} from "./livestreams-model";
import { LivestreamsSkeleton } from "./livestreams-skeleton";
import { ManagersDialog } from "./managers-dialog";
import { RequestDialog } from "./request-dialog";
import { ScheduleStrip } from "./schedule-strip";
import { ScheduleView } from "./schedule-view";
import { newSince } from "./since-last-visit";
import { signupGroupId, SignupsView } from "./signups-view";
import { useLivestreamsData } from "./use-livestreams-data";
import { useSinceLastVisit } from "./use-since-last-visit";

const VIEWS: View[] = ["schedule", "signups", "completion"];
const FILTERS: ScheduleFilter[] = ["all", "open", "mine", "action"];
const TABS_ID = "livestreams";

function isView(value: unknown): value is View {
  return VIEWS.includes(value as View);
}

function isScheduleFilter(value: unknown): value is ScheduleFilter {
  return FILTERS.includes(value as ScheduleFilter);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** One request dialog per opening (`key`); `open` turns false while the event stays for the exit animation. */
type RequestTarget = { key: number; event: EventRow; open: boolean };

/** The payload failed to refresh but an older copy is on screen. */
function StaleDataAlert({ message, busy, onRetry }: { message: string; busy: boolean; onRetry: () => void }) {
  return (
    <Alert
      tone="danger"
      action={
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRetry}>
          {busy ? <Spinner /> : <RotateCw aria-hidden />}
          Try again
        </Button>
      }
    >
      Couldn&apos;t load livestreams: {message}
    </Alert>
  );
}

export default function LivestreamsClient() {
  const live = useLivestreamsData();
  const { data, showCompletion, ensureMembers } = live;
  const visit = useSinceLastVisit(live.fresh);

  const [storedView, setStoredView] = useRememberedState<View>("livestreams:view:v1", "schedule", isView);
  const views = allowedViews(data);
  const view: View = views.includes(storedView) ? storedView : "schedule";
  const { reload } = live;
  /** A tab switch also refreshes the schedule quietly, so a queue left open doesn't go stale. */
  const setView = useCallback(
    (next: View) => {
      setStoredView(next);
      if (next !== view) void reload();
    },
    [setStoredView, view, reload]
  );
  const [storedFilter, setFilter] = useRememberedState<ScheduleFilter>("livestreams:schedule-filter:v1", "all", isScheduleFilter);
  const filter = data && scheduleFilterOptions(data).includes(storedFilter) ? storedFilter : "all";
  // null = never toggled: open for managers (past livestreams are their close-out work), folded for everyone else.
  const [earlierPref, setEarlierPref] = useRememberedState<boolean | null>("livestreams:earlier-open:v1", null, isBooleanOrNull);

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [request, setRequest] = useState<RequestTarget | null>(null);
  const session = useRef(0);
  const [signupNotes, setSignupNotes] = useState<Record<string, string>>({});
  const [managersOpen, setManagersOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [changesDismissed, setChangesDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // "Today", upcoming and "to mark completed" follow the clock and every fresh payload.
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [data]);

  useEffect(() => {
    if (view === "completion" && data?.canViewCompletion) showCompletion();
  }, [view, data?.canViewCompletion, showCompletion]);

  // After switching to Sign ups from a row's "+N requests", bring that livestream's panel into view.
  useEffect(() => {
    if (!scrollTarget) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(scrollTarget.id)
        ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTarget]);

  const toComplete = useMemo(() => (data ? data.events.filter((event) => needsCompletion(event, now)).length : 0), [data, now]);
  const earlierOpen = earlierPref ?? Boolean(data?.canManage);
  const newEventIds = useMemo(() => new Set(visit?.changes?.eventIds ?? []), [visit]);
  const newRequestIds = useMemo(
    () => new Set(newSince(data?.pendingSignups ?? [], visit?.lastSeenAt ?? null).map((pending) => pending.id)),
    [data, visit]
  );

  const openEditor = useCallback(
    (event: EventRow | null, complete: boolean) => {
      session.current += 1;
      setEditor({ key: session.current, event, complete });
      void ensureMembers();
    },
    [ensureMembers]
  );
  const openCreate = useCallback(() => openEditor(null, false), [openEditor]);

  /** Closes only the editor that asked: a save that finishes late never closes a newer one. */
  const closeEditor = (key: number) => setEditor((current) => (current?.key === key ? null : current));

  const openRequest = (event: EventRow) => {
    session.current += 1;
    setRequest({ key: session.current, event, open: true });
  };
  const closeRequest = (key: number) =>
    setRequest((current) => (current?.key === key ? { ...current, open: false } : current));

  const openManagers = () => {
    setManagersOpen(true);
    void ensureMembers();
  };

  const refresh = () => {
    void live.reload();
    live.refreshMembers();
    if (view === "completion") void live.loadCompletion();
  };

  const openRequests = (event: EventRow) => {
    setView("signups");
    setScrollTarget({ id: signupGroupId(event.id), nonce: Date.now() });
  };

  useHotkeys({ n: openCreate }, { enabled: Boolean(data?.canManage) });

  if (!data) {
    if (live.initialLoading) return <LivestreamsSkeleton />;
    return (
      <div className="space-y-5">
        <LivestreamsHeader data={null} view="schedule" refreshing={live.refreshing} onRefresh={refresh} onManagers={openManagers} onAddEvent={openCreate} />
        <div className="rounded-md border border-border bg-card">
          <ErrorState
            title="Couldn't load livestreams"
            message={live.loadError ?? "Failed to load"}
            onRetry={() => void live.reload()}
            busy={live.refreshing}
          />
        </div>
      </div>
    );
  }

  const ctx: EventContext = {
    payload: data,
    now,
    newIds: newEventIds,
    onRequest: openRequest,
    onEdit: (event) => openEditor(event, false),
    onComplete: (event) => openEditor(event, true),
    onOpenRequests: openRequests
  };

  const schedule = (
    <div className="space-y-5">
      <ScheduleStrip
        payload={data}
        now={now}
        toComplete={toComplete}
        visit={visit}
        changesDismissed={changesDismissed}
        onDismissChanges={() => setChangesDismissed(true)}
      />
      <ScheduleView
        ctx={ctx}
        filter={filter}
        onFilterChange={setFilter}
        toComplete={toComplete}
        earlierOpen={earlierOpen}
        onEarlierOpenChange={setEarlierPref}
        onAddEvent={openCreate}
      />
    </div>
  );

  const panels: Record<View, ReactNode> = {
    schedule,
    signups: <SignupsView payload={data} now={now} newIds={newRequestIds} onReview={live.reviewSignup} />,
    completion: (
      <CompletionView rows={live.completion} loading={live.completionLoading} error={live.completionError} onRetry={() => void live.loadCompletion()} />
    )
  };
  const pendingCount = data.pendingSignups.length;

  return (
    <div className="space-y-5">
      <LivestreamsHeader
        data={data}
        view={view}
        refreshing={live.refreshing}
        onRefresh={refresh}
        onManagers={openManagers}
        onAddEvent={openCreate}
      />

      {views.length > 1 ? (
        <ViewTabs
          idPrefix={TABS_ID}
          ariaLabel="Livestream views"
          value={view}
          onChange={setView}
          items={views.map((item) => ({
            value: item,
            label: VIEW_TITLES[item],
            ...(item === "signups"
              ? {
                  count: pendingCount,
                  countTone: "brand" as const,
                  countLabel: `${pendingCount} pending sign-up ${pendingCount === 1 ? "request" : "requests"}${
                    newRequestIds.size ? `, ${newRequestIds.size} new since your last visit` : ""
                  }`
                }
              : {})
          }))}
        />
      ) : null}

      {live.loadError ? <StaleDataAlert message={live.loadError} busy={live.refreshing} onRetry={() => void live.reload()} /> : null}

      {views.length > 1
        ? views.map((item) => (
            <ViewTabPanel key={item} idPrefix={TABS_ID} value={item} active={view === item}>
              {view === item ? panels[item] : null}
            </ViewTabPanel>
          ))
        : schedule}

      {editor ? (
        <EventEditor
          key={editor.key}
          target={editor}
          managers={data.managers}
          members={live.members}
          membersError={live.membersError}
          onRetryMembers={() => void ensureMembers()}
          onSave={live.saveEvent}
          onDelete={live.deleteEvent}
          onClose={() => closeEditor(editor.key)}
        />
      ) : null}

      {request ? (
        <RequestDialog
          key={request.key}
          event={request.event}
          open={request.open}
          note={signupNotes[request.event.id] ?? ""}
          onNoteChange={(eventId, note) => setSignupNotes((current) => ({ ...current, [eventId]: note }))}
          onClose={() => closeRequest(request.key)}
          onSubmit={async (event, note) => {
            await live.requestSignup(event.id, note);
            setSignupNotes((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== event.id)));
          }}
        />
      ) : null}

      {data.canAppointManagers ? (
        <ManagersDialog
          open={managersOpen}
          onOpenChange={setManagersOpen}
          managers={data.managers}
          members={live.members}
          membersError={live.membersError}
          onRetryMembers={() => void ensureMembers()}
          onAdd={live.addManager}
          onRemove={live.removeManager}
        />
      ) : null}
    </div>
  );
}
