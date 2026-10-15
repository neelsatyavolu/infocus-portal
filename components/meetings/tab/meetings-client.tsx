"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CalendarPlus, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { useRememberedState } from "@/components/kit/remembered-state";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { LoadingRegion } from "@/components/kit/skeleton";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import type { MeetingListResponse, MeetingSummary } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { canJoinNow, pacificDayKey } from "@/src/lib/meetings/client/time";
import { ConfirmDialog } from "../confirm-dialog";
import { BoardColumns, HIDDEN_WHEN_STACKED, STACKED_ONLY } from "./board-columns";
import { boardLists } from "./board-lists";
import { CalendarInvitesSheet } from "./calendar-invites-sheet";
import { anyRowMenu } from "./meeting-row-actions";
import { ListPanelSkeleton } from "./meetings-skeleton";
import { MoveDialog } from "./move-dialog";
import { NowPanel } from "./now-panel";
import { PastPanel } from "./past-panel";
import { ProducerSeriesCard } from "./producer-series-card";
import { ScheduleDialog } from "./schedule-dialog";
import { StartMeetingButton } from "./start-meeting-button";
import { UpcomingPanel } from "./upcoming-panel";

// The agenda editor (and @dnd-kit) loads on demand; both sheets start closed.
const MeetingAgendaSheet = dynamic(() => import("@/components/meetings/agenda/agenda-sheets").then((m) => m.MeetingAgendaSheet), { ssr: false });
const AgendaFromQuery = dynamic(() => import("@/components/meetings/agenda/agenda-sheets").then((m) => m.AgendaFromQuery), { ssr: false });

const REFRESH_MS = 60_000;
const TICK_MS = 10_000;
/** Last list for an instant return to the tab (src/lib/client-cache.ts; cleared on identity change). */
const CACHE_KEY = "meetings:list";

type Segment = "upcoming" | "past";
const isSegment = (value: unknown): value is Segment => value === "upcoming" || value === "past";

export default function MeetingsClient() {
  const router = useRouter();
  // The cache is in memory only (empty on a full page load), so this never differs from the server render.
  const [data, setData] = useState<MeetingListResponse | null>(() => cachedValue<MeetingListResponse>(CACHE_KEY) ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [dialog, setDialog] = useState<"schedule" | "private-now" | null>(null);
  const [moving, setMoving] = useState<MeetingSummary | null>(null);
  const [cancelling, setCancelling] = useState<MeetingSummary | null>(null);
  const [invitesOpen, setInvitesOpen] = useState(false);
  // One agenda sheet for the tab, not one per row: a row moves from Upcoming to Join now when its
  // join window opens, and the sheet (with any half-typed item) must stay open through that.
  // `agendaFor` stays set after closing so the sheet keeps its content while it animates out.
  const [agendaFor, setAgendaFor] = useState<MeetingSummary | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  // Item counts the sheet loaded, by meeting id, so a row's Agenda count follows edits at once.
  const [agendaCounts, setAgendaCounts] = useState<Readonly<Record<string, number>>>({});
  // Phones and narrow windows show one list at a time; the choice is remembered per browser.
  const [segment, setSegment] = useRememberedState<Segment>("meetings.tab", "upcoming", isSegment);

  const load = useCallback(
    () =>
      meetingsApi
        .list()
        .then((next) => {
          rememberValue(CACHE_KEY, next);
          setData(next);
          setLoadError(null);
        })
        .catch((err: unknown) => {
          setLoadError(errorMessage(err, "Couldn't load meetings."));
        }),
    []
  );

  useEffect(() => {
    void load();
    // Hidden tabs skip the refresh; coming back reloads and resets the clock at once.
    const refresh = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    // Join buttons enable on time without waiting for the next refresh.
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    const onVisible = () => {
      if (document.hidden) return;
      setNow(Date.now());
      void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // A string, so the panels keep the same lists between clock ticks and only re-render when a
  // meeting opens (or the day changes).
  const openKey = useMemo(
    () => (data?.upcoming ?? []).filter((m) => canJoinNow(m, now)).map((m) => m.id).join(" "),
    [data, now]
  );
  const todayKey = pacificDayKey(new Date(now));
  const lists = useMemo(() => (data ? boardLists(data, new Set(openKey.split(" ").filter(Boolean))) : null), [data, openKey]);
  // One ⋯ column decision for Now and Upcoming together, so their action columns line up.
  const showMenuSlot = useMemo(
    () => (lists ? anyRowMenu([...lists.now, ...lists.upcoming], { onMove: setMoving, onCancel: setCancelling }) : false),
    [lists]
  );
  const openInvites = useCallback(() => setInvitesOpen(true), []);
  const openAgenda = useCallback((meeting: MeetingSummary) => {
    setAgendaFor(meeting);
    setAgendaOpen(true);
  }, []);
  const rememberAgendaCount = useCallback((meetingId: string, count: number) => {
    setAgendaCounts((prev) => (prev[meetingId] === count ? prev : { ...prev, [meetingId]: count }));
  }, []);
  const startPrivate = useCallback(() => setDialog("private-now"), []);

  async function startNow() {
    setStarting(true);
    try {
      const { meeting } = await meetingsApi.create({ title: "Quick meeting" });
      router.push(`/meet/${encodeURIComponent(meeting.id)}` as never);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't start a meeting."));
      setStarting(false);
    }
  }

  async function cancelMeeting(meeting: MeetingSummary) {
    try {
      await meetingsApi.patch(meeting.id, { status: "CANCELED" });
      toast.success("Meeting cancelled.");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't cancel the meeting."));
      throw err;
    }
  }

  const onCreated = (meeting: MeetingSummary) => {
    if (dialog === "private-now") {
      router.push(`/meet/${encodeURIComponent(meeting.id)}` as never);
      return;
    }
    toast.success("Meeting scheduled.");
    void load();
  };

  // One filled button per view: while a Join is open, Start now steps back to outline.
  const joinOpen = Boolean(lists && lists.now.length > 0);
  // Until the first list arrives: skeletons where the lists will be (not after a failed load).
  const loading = !lists && !loadError;
  const showLists = Boolean(lists) || loading;

  return (
    <div className="route-enter space-y-5">
      {/*
        No LIVE tag in the header: the Join now panel right under it shows each live meeting with
        the one Record Red dot (DESIGN.md: one touch of red), and the sidebar signals it too.
      */}
      <PageHeader
        eyebrow="Producers"
        title="Meetings"
        description={
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> Calls are end-to-end encrypted. Times are Pacific.
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog("schedule")} className="max-md:h-10!">
              <CalendarPlus aria-hidden /> Schedule
            </Button>
            <StartMeetingButton
              starting={starting}
              onStart={() => void startNow()}
              onStartPrivate={data?.canCreateInviteOnly ? startPrivate : undefined}
              variant={joinOpen ? "outline" : "default"}
              className="max-md:h-10!"
            />
          </>
        }
      />

      {/*
        The InFocus Producer Meeting card (its link and Calendar invites) renders from the first
        paint and stays when the list fails to load; only the lists wait for data. A load error
        heads the main column, beside that card.
      */}
      <BoardColumns
        main={
          <>
            {loadError ? (
              <Alert
                tone="danger"
                action={
                  <Button size="sm" variant="outline" onClick={() => void load()} className="max-md:h-10!">
                    Try again
                  </Button>
                }
              >
                {loadError}
              </Alert>
            ) : null}
            {lists ? (
              <NowPanel
                meetings={lists.now}
                showMenuSlot={showMenuSlot}
                agendaCounts={agendaCounts}
                onAgenda={openAgenda}
                onMove={setMoving}
                onCancel={setCancelling}
              />
            ) : null}
            {showLists ? (
              <div className={STACKED_ONLY}>
                <SegmentedControl
                  ariaLabel="Show"
                  value={segment}
                  onChange={setSegment}
                  size="touch"
                  fullWidth
                  options={[
                    { value: "upcoming", label: "Upcoming", count: lists?.upcoming.length },
                    { value: "past", label: "Past", count: lists?.past.length }
                  ]}
                />
              </div>
            ) : null}
            {showLists ? (
              <div className={segment === "past" ? HIDDEN_WHEN_STACKED : undefined}>
                {lists ? (
                  <UpcomingPanel
                    meetings={lists.upcoming}
                    startingCount={lists.startingCount}
                    todayKey={todayKey}
                    showMenuSlot={showMenuSlot}
                    agendaCounts={agendaCounts}
                    onAgenda={openAgenda}
                    onMove={setMoving}
                    onCancel={setCancelling}
                  />
                ) : (
                  <LoadingRegion label="Loading meetings…">
                    <ListPanelSkeleton rows={5} description actions />
                  </LoadingRegion>
                )}
              </div>
            ) : null}
          </>
        }
        rail={
          <>
            {showLists ? (
              <div className={segment === "upcoming" ? HIDDEN_WHEN_STACKED : undefined}>
                {lists ? <PastPanel meetings={lists.past} todayKey={todayKey} /> : <ListPanelSkeleton rows={4} />}
              </div>
            ) : null}
            <ProducerSeriesCard
              live={lists?.seriesLive ?? false}
              next={lists ? lists.seriesNext : undefined}
              loading={loading}
              onOpenInvites={openInvites}
            />
          </>
        }
      />

      <ScheduleDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        mode={dialog ?? "schedule"}
        canCreateInviteOnly={Boolean(data?.canCreateInviteOnly)}
        onCreated={onCreated}
      />
      <CalendarInvitesSheet open={invitesOpen} onOpenChange={setInvitesOpen} />
      {agendaFor ? (
        <MeetingAgendaSheet
          key={agendaFor.id}
          meeting={agendaFor}
          open={agendaOpen}
          onOpenChange={setAgendaOpen}
          onCount={rememberAgendaCount}
        />
      ) : null}
      <AgendaFromQuery />
      <MoveDialog meeting={moving} onOpenChange={(open) => !open && setMoving(null)} onMoved={() => void load()} />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={`Cancel ${cancelling?.title ?? "meeting"}?`}
        description="Producers won't be able to join it. Calendar invites get an update."
        confirmLabel="Cancel meeting"
        onConfirm={() => (cancelling ? cancelMeeting(cancelling) : undefined)}
      />
    </div>
  );
}
