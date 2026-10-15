"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, Check, ImageDown, MonitorPlay, Radio, RotateCw, Timer } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { PHONE_TABBAR_ROOT_CLASS } from "@/components/kit/phone-tab-bar";
import { StatusDot, StatusTag, type StatusDotTone } from "@/components/kit/status-tag";
import { ViewTabPanel, ViewTabs } from "@/components/kit/view-tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { graphicDefinition, type LiveImageState } from "@/src/lib/live/graphics";
import { applyScoreboardAction, type ScoreboardAction, type ScoreboardState } from "@/src/lib/live/scoreboard";
import { cn } from "@/src/lib/utils";
import type { LiveEventSummary, LiveGraphicsPayload } from "@/src/server/live-graphics";
import { useServerOffset } from "@/components/live/live-stage";
import { LiveHeader } from "./live-header";
import { useRememberedTab, useSaveView } from "./live-hooks";
import { LiveImagePanel } from "./live-image-panel";
import { LivePhoneTabs } from "./live-phone-tabs";
import { LiveTabSkeleton } from "./live-skeletons";
import {
  DASH_TABS,
  NOT_SYNCING_AFTER,
  findEvent,
  isPastEvent,
  scoreboardAlertTone,
  type DashTab,
  type SaveView
} from "./live-status";
import { ScoreboardPanel } from "./scoreboard-panel";
import { ThumbnailPanel } from "./thumbnail-panel";

const TAB_ICONS = { thumbnail: ImageDown, scoreboard: Timer, image: MonitorPlay } as const;
const TAB_ID_PREFIX = "live";

const REFRESH_MS = 4000;
const MAX_BATCH = 50;
const RETRY_MS = [1000, 2000, 4000, 8000];

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(body?.error?.message ?? `Request failed (${response.status}).`, response.status);
  return body.data as T;
}

/** Network errors, conflicts, rate limits and server errors are worth retrying; bad input is not. */
function isRetryable(error: unknown) {
  if (!(error instanceof RequestError)) return true;
  return error.status >= 500 || error.status === 408 || error.status === 409 || error.status === 429;
}

type QueuedAction = { eventId: string; action: ScoreboardAction };

/**
 * What went wrong, so load errors can offer Try again and clear themselves once a load works.
 * `retrying` marks a scoreboard save that will be tried again (amber, not red).
 */
type DashError = { kind: "events" | "event" | "save" | "image" | "rotate"; message: string; retrying?: boolean };

/** `detail` is the save error's full message, shown on hover (the tag itself stays short). */
function SaveTag({ view, detail }: { view: SaveView; detail?: string }) {
  if (view === "saving") return <StatusTag spinner>Saving</StatusTag>;
  if (view === "retrying")
    return (
      <StatusTag tone="warning" icon={RotateCw} title={detail ?? "OBS shows the last saved score until this saves."}>
        Retrying
      </StatusTag>
    );
  if (view === "failed")
    return (
      <StatusTag tone="danger" icon={AlertTriangle} title={detail}>
        Not saved
      </StatusTag>
    );
  if (view === "saved") return <StatusTag icon={Check}>Saved</StatusTag>;
  return null;
}

/**
 * A scoreboard save problem in full words: why it failed, when it retries, and that OBS still
 * shows the last saved score. It sits in the clock (or set) card's hint line, so the keypads
 * below don't move mid-game.
 */
function SaveNotice({ message, retrying }: { message: string; retrying: boolean }) {
  const Icon = retrying ? RotateCw : AlertTriangle;
  return (
    <p
      role="alert"
      className={cn("flex min-w-0 items-start gap-1.5 text-[13px] leading-snug", retrying ? "text-[var(--brand-amber)]" : "text-danger")}
    >
      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{message}</span>
    </p>
  );
}

function NotSyncingTag() {
  return (
    <StatusTag tone="warning" icon={AlertTriangle} title="Changes from other devices aren't arriving. Check your connection.">
      Not syncing
    </StatusTag>
  );
}

/** Screen-reader words for the Scoreboard tab's alert dot. */
function alertLabel(save: SaveView) {
  if (save === "failed") return "A change wasn't saved";
  if (save === "retrying") return "Retrying a save";
  return "Not syncing";
}

export function LiveDashboard({ canRotateKey, signedIn }: { canRotateKey: boolean; signedIn: boolean }) {
  const [events, setEvents] = useState<LiveEventSummary[] | null>(null);
  const [pastEvents, setPastEvents] = useState<LiveEventSummary[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);
  const [data, setData] = useState<LiveGraphicsPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);
  const { offset, sample } = useServerOffset();
  const [tab, selectTab] = useRememberedTab("scoreboard");
  const [error, setError] = useState<DashError | null>(null);
  const [origin, setOrigin] = useState("");
  // Presentation only: failed polls in a row, for the NOT SYNCING tag.
  const [pollFailures, setPollFailures] = useState(0);

  // The board on screen is always the last server board plus the actions not yet saved.
  const serverBoardRef = useRef<ScoreboardState | null>(null);
  const queueRef = useRef<QueuedAction[]>([]);
  const inFlightRef = useRef(false);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryCountRef = useRef(0);
  const eventIdRef = useRef<string | null>(null);
  const offsetRef = useRef(0);
  offsetRef.current = offset;
  // Presentation only: what the save tag reads. Set in flush; never steers the queue.
  const savedOnceRef = useRef(false);
  const saveFailedRef = useRef(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const loadEvents = useCallback(() => {
    let cancelled = false;
    fetch("/api/live/events", { cache: "no-store" })
      .then((response) => readJson<{ events: LiveEventSummary[]; pastEvents: LiveEventSummary[] }>(response))
      .then(({ events: list, pastEvents: past }) => {
        if (cancelled) return;
        setEvents(list);
        setPastEvents(past);
        setEventId((current) => current ?? list[0]?.id ?? null);
        setError((current) => (current?.kind === "events" ? null : current));
      })
      .catch((caught: Error) => !cancelled && setError({ kind: "events", message: `Couldn't load livestreams: ${caught.message}` }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => loadEvents(), [loadEvents]);

  /** Shows a server board for the current event, replaying any actions still waiting to save. */
  const showServerBoard = useCallback((board: ScoreboardState) => {
    const id = eventIdRef.current;
    serverBoardRef.current = board;
    const now = Date.now() + offsetRef.current;
    const local = queueRef.current
      .filter((entry) => entry.eventId === id)
      .reduce((state, entry) => applyScoreboardAction(state, entry.action, now), board);
    setScoreboard(local);
  }, []);

  const applyPayload = useCallback(
    (payload: LiveGraphicsPayload, sentAt: number) => {
      sample(sentAt, Date.now(), payload.serverNow);
      if (payload.event.id !== eventIdRef.current) return;
      setData(payload);
      showServerBoard(payload.scoreboard);
    },
    [sample, showServerBoard]
  );

  const loadEvent = useCallback(
    async (id: string) => {
      const sentAt = Date.now();
      applyPayload(await readJson<LiveGraphicsPayload>(await fetch(`/api/live/events/${id}`, { cache: "no-store" })), sentAt);
    },
    [applyPayload]
  );

  /** Loads one livestream; a success clears a stale load error, a failure shows one (with Try again). */
  const openEvent = useCallback(
    (id: string) => {
      loadEvent(id)
        .then(() => {
          if (eventIdRef.current !== id) return;
          setPollFailures(0);
          setError((current) => (current?.kind === "event" ? null : current));
        })
        .catch((caught: Error) => {
          if (eventIdRef.current === id) setError({ kind: "event", message: `Couldn't load this livestream: ${caught.message}` });
        });
    },
    [loadEvent]
  );

  useEffect(() => {
    eventIdRef.current = eventId;
    serverBoardRef.current = null;
    setData(null);
    setScoreboard(null);
    // Status that belonged to the previous livestream.
    savedOnceRef.current = false;
    saveFailedRef.current = false;
    setPollFailures(0);
    setError((current) => (current && current.kind !== "save" && current.kind !== "events" ? null : current));
    if (!eventId) return;
    openEvent(eventId);
  }, [eventId, openEvent]);

  // Pick up changes from another device (a second operator) whenever nothing is waiting to save.
  useEffect(() => {
    if (!eventId) return;
    const id = window.setInterval(() => {
      if (document.hidden || inFlightRef.current || queueRef.current.length) return;
      loadEvent(eventId)
        .then(() => {
          if (eventIdRef.current !== eventId) return;
          setPollFailures(0);
          setError((current) => (current?.kind === "event" ? null : current));
        })
        .catch(() => {
          if (eventIdRef.current === eventId) setPollFailures((count) => count + 1);
        });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [eventId, loadEvent]);

  const flush = useCallback(async () => {
    const queue = queueRef.current;
    if (inFlightRef.current || retryTimerRef.current !== undefined || !queue.length) return;
    const batchEvent = queue[0].eventId;
    const batch: QueuedAction[] = [];
    for (const entry of queue) {
      if (entry.eventId !== batchEvent || batch.length >= MAX_BATCH) break;
      batch.push(entry);
    }
    inFlightRef.current = true;
    const sentAt = Date.now();
    try {
      const response = await fetch(`/api/live/events/${batchEvent}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: batch.map((entry) => entry.action) })
      });
      const payload = await readJson<LiveGraphicsPayload>(response);
      queueRef.current = queueRef.current.filter((entry) => !batch.includes(entry));
      retryCountRef.current = 0;
      savedOnceRef.current = true;
      saveFailedRef.current = false;
      setError(null);
      applyPayload(payload, sentAt);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown error";
      if (isRetryable(caught)) {
        const wait = RETRY_MS[Math.min(retryCountRef.current, RETRY_MS.length - 1)];
        retryCountRef.current += 1;
        setError({
          kind: "save",
          message: `Couldn't save the scoreboard (${message}). Retrying in ${wait / 1000}s. OBS shows the last saved score until then.`,
          retrying: true
        });
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = undefined;
          void flush();
        }, wait);
      } else {
        queueRef.current = queueRef.current.filter((entry) => !batch.includes(entry));
        saveFailedRef.current = true;
        setError({ kind: "save", message: `That change wasn't saved: ${message}` });
        if (batchEvent === eventIdRef.current) loadEvent(batchEvent).catch(() => undefined);
      }
    } finally {
      inFlightRef.current = false;
      if (queueRef.current.length && retryTimerRef.current === undefined) void flush();
    }
  }, [applyPayload, loadEvent]);

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

  const readSaveState = useCallback(
    () => ({
      pending: queueRef.current.length > 0 || inFlightRef.current,
      retrying: retryTimerRef.current !== undefined,
      failed: saveFailedRef.current,
      savedOnce: savedOnceRef.current
    }),
    []
  );
  const save = useSaveView(readSaveState, Boolean(eventId));

  const dispatch = useCallback(
    (action: ScoreboardAction) => {
      const id = eventIdRef.current;
      if (!id || !serverBoardRef.current) return;
      queueRef.current = [...queueRef.current, { eventId: id, action }];
      setScoreboard((current) => (current ? applyScoreboardAction(current, action, Date.now() + offsetRef.current) : current));
      void flush();
    },
    [flush]
  );

  const saveLiveImage = useCallback(
    async (liveImage: LiveImageState) => {
      if (!eventId) return;
      const sentAt = Date.now();
      try {
        const response = await fetch(`/api/live/events/${eventId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ liveImage })
        });
        const payload = await readJson<LiveGraphicsPayload>(response);
        sample(sentAt, Date.now(), payload.serverNow);
        setData((current) => (current && current.event.id === payload.event.id ? { ...current, liveImage: payload.liveImage } : current));
        setError(null);
      } catch (caught) {
        setError({
          kind: "image",
          message: `Couldn't update the live image: ${caught instanceof Error ? caught.message : "unknown error"}. Try again.`
        });
      }
    },
    [eventId, sample]
  );

  const rotateKey = useCallback(async () => {
    if (!eventId || !window.confirm("Make new OBS links for this livestream? The old links stop working right away.")) return;
    const sentAt = Date.now();
    try {
      applyPayload(await readJson<LiveGraphicsPayload>(await fetch(`/api/live/events/${eventId}/key`, { method: "POST" })), sentAt);
    } catch (caught) {
      setError({ kind: "rotate", message: `Couldn't make new links: ${caught instanceof Error ? caught.message : "unknown error"}.` });
    }
  }, [eventId, applyPayload]);
  const onRotateKey = useCallback(() => void rotateKey(), [rotateKey]);

  const overlayBase = data ? `${origin}/live/${data.overlayKey}` : "";
  const selectedEvent = findEvent(eventId, events, pastEvents) ?? data?.event ?? null;
  const onAirName = data?.liveImage ? graphicDefinition(data.liveImage.graphic).name : null;
  const ready = Boolean(data && scoreboard);
  const eventsLoading = events === null && error?.kind !== "events";
  // Tabs only while there is a livestream to work on, or one may still arrive.
  const showTabs = Boolean(eventId) || eventsLoading;
  const clockDock = ready && scoreboard?.sport !== "volleyball";
  const hasDock = ready && (tab !== "scoreboard" || clockDock);
  const showSkeleton = !ready && (eventsLoading || (Boolean(eventId) && error?.kind !== "event"));
  const tabLabel = DASH_TABS.find((item) => item.value === tab)?.label ?? "";

  // "Something happened" marks that stay on screen after the header scrolls away.
  const notSyncing = pollFailures >= NOT_SYNCING_AFTER;
  const alertTone = scoreboardAlertTone(save, notSyncing);
  const liveDotOnTab = Boolean(onAirName) && tab !== "image";
  // On the Scoreboard tab the phone clock bar carries the alert (volleyball has no bar).
  const alertDotOnTab = Boolean(alertTone) && (tab !== "scoreboard" || !clockDock);
  // Save problems show as tags (header, tab dot, phone clock bar) and, on the Scoreboard tab, in
  // full words in the clock card's hint line rather than a banner that would push the keypad down
  // mid-game. On the other tabs (no keypad) the banner carries the words, as before.
  const saveDetail = error?.kind === "save" ? error.message : undefined;
  const saveInCard = error?.kind === "save" && tab === "scoreboard" && ready;
  const bannerError = error && !saveInCard ? error : null;
  const saveNotice = saveInCard && error ? <SaveNotice message={error.message} retrying={Boolean(error.retrying)} /> : undefined;
  const dockStatus = alertTone ? (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {save === "retrying" || save === "failed" ? <SaveTag view={save} detail={saveDetail} /> : null}
      {notSyncing ? <NotSyncingTag /> : null}
    </span>
  ) : undefined;

  function tabDot(value: DashTab): { tone: StatusDotTone; label: string } | null {
    if (value === "image" && liveDotOnTab) return { tone: "live", label: "On air" };
    if (value === "scoreboard" && alertDotOnTab && alertTone) return { tone: alertTone, label: alertLabel(save) };
    return null;
  }

  function retry() {
    if (error?.kind === "events") loadEvents();
    else if (error?.kind === "event" && eventId) openEvent(eventId);
  }

  const loadError = bannerError?.kind === "events" || bannerError?.kind === "event";
  // Only errors from your own tap (live image, new links) can be dismissed; save errors clear on the next save.
  const dismissable = bannerError?.kind === "image" || bannerError?.kind === "rotate";

  const status = (
    <>
      {isPastEvent(eventId, pastEvents) ? (
        <StatusTag tone="warning" title="A past livestream. Changes still save to it.">
          Past
        </StatusTag>
      ) : null}
      {onAirName ? (
        <StatusTag tone="live" title={`Live image on air: ${onAirName}`}>
          On air · {onAirName}
        </StatusTag>
      ) : null}
      {/* Always mounted, so screen readers hear the save state change. */}
      <span aria-live="polite" className="inline-flex">
        <SaveTag view={save} detail={saveDetail} />
      </span>
      {notSyncing ? <NotSyncingTag /> : null}
    </>
  );

  return (
    <main
      style={{ "--live-dock-h": hasDock ? "3.875rem" : "0px" } as CSSProperties}
      className={cn("group/live min-h-dvh touch-manipulation bg-background text-foreground", showTabs && PHONE_TABBAR_ROOT_CLASS.md)}
    >
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-4 px-4 pb-[calc(var(--phone-tabbar-h,0px)+var(--live-dock-h,0px)+env(safe-area-inset-bottom)+1rem)] pt-3 md:px-6 md:pb-10 md:pt-5">
        <LiveHeader
          event={selectedEvent}
          loading={eventsLoading}
          status={status}
          signedIn={signedIn}
          eventId={eventId}
          events={events}
          pastEvents={pastEvents}
          onEventChange={setEventId}
        />

        {showTabs ? (
          <div className="hidden md:block">
            <ViewTabs
              ariaLabel="Dashboard tab"
              idPrefix={TAB_ID_PREFIX}
              value={tab}
              onChange={selectTab}
              items={DASH_TABS.map((item) => {
                const dot = tabDot(item.value);
                return { value: item.value, label: item.label, dot: dot?.tone, dotLabel: dot?.label };
              })}
            />
          </div>
        ) : null}

        {/* Load errors offer Try again; image and new-link errors (after your own tap) can be dismissed. */}
        {bannerError ? (
          <Alert
            tone={bannerError.retrying ? "warning" : "danger"}
            role="alert"
            onDismiss={dismissable ? () => setError(null) : undefined}
            action={
              loadError ? (
                <Button type="button" variant="outline" size="sm" className="max-md:h-11!" onClick={retry}>
                  <RotateCw aria-hidden />
                  Try again
                </Button>
              ) : null
            }
          >
            {bannerError.message}
          </Alert>
        ) : null}

        {events?.length === 0 && !eventId ? (
          <div className="rounded-md border border-border bg-card">
            <EmptyState
              size="page"
              icon={Radio}
              title="No livestreams to run"
              description={`There are no livestreams from the last 12 hours or the next 45 days. Add one on the Livestreams page${
                pastEvents.length ? ", or pick a past livestream with Switch" : ""
              }.`}
              action={
                signedIn ? (
                  <Link href="/livestreams" className={buttonVariants()}>
                    Open Livestreams
                  </Link>
                ) : null
              }
            />
          </div>
        ) : null}

        {showTabs ? (
          <ViewTabPanel idPrefix={TAB_ID_PREFIX} value={tab} active className="min-w-0">
            <h2 className="sr-only">{tabLabel}</h2>
            {data && scoreboard ? (
              <>
                {tab === "thumbnail" ? <ThumbnailPanel key={data.event.id} event={data.event} scoreboard={scoreboard} /> : null}
                {tab === "scoreboard" ? (
                  <ScoreboardPanel
                    scoreboard={scoreboard}
                    dispatch={dispatch}
                    offset={offset}
                    overlayUrl={`${overlayBase}/scoreboard`}
                    onRotateKey={canRotateKey ? onRotateKey : undefined}
                    dockStatus={dockStatus}
                    notice={saveNotice}
                  />
                ) : null}
                {tab === "image" ? (
                  <LiveImagePanel
                    event={data.event}
                    scoreboard={scoreboard}
                    liveImage={data.liveImage}
                    offset={offset}
                    overlayUrl={`${overlayBase}/image`}
                    onSave={saveLiveImage}
                    onRotateKey={canRotateKey ? onRotateKey : undefined}
                  />
                ) : null}
              </>
            ) : showSkeleton ? (
              <LiveTabSkeleton tab={tab} />
            ) : null}
          </ViewTabPanel>
        ) : null}
      </div>

      {/* Phones: tabs sit at the bottom, within thumb reach. */}
      {showTabs ? (
        <LivePhoneTabs
          ariaLabel="Dashboard tab"
          items={DASH_TABS.map((item) => {
            const dot = tabDot(item.value);
            return {
              key: item.value,
              label: item.label,
              icon: TAB_ICONS[item.value],
              active: tab === item.value,
              badge: dot ? <StatusDot tone={dot.tone} size={6} label={dot.label} /> : undefined,
              onSelect: () => {
                selectTab(item.value);
                window.scrollTo({ top: 0 });
              }
            };
          })}
        />
      ) : null}
    </main>
  );
}
