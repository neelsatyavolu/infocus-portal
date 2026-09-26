"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import type { LiveImageState } from "@/src/lib/live/graphics";
import { applyScoreboardAction, type ScoreboardAction, type ScoreboardState } from "@/src/lib/live/scoreboard";
import type { LiveEventSummary, LiveGraphicsPayload } from "@/src/server/live-graphics";
import { useServerOffset } from "@/components/live/live-stage";
import { LiveImagePanel } from "./live-image-panel";
import { Seg } from "./live-controls";
import { ScoreboardPanel } from "./scoreboard-panel";
import { ThumbnailPanel } from "./thumbnail-panel";

type Tab = "thumbnail" | "scoreboard" | "image";
const TABS = [
  { value: "thumbnail", label: "Thumbnail" },
  { value: "scoreboard", label: "Scoreboard" },
  { value: "image", label: "Live image" }
] as const;

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

function formatEventOption(event: LiveEventSummary) {
  const when = new Date(event.startsAt).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return `${when} · ${event.title}`;
}

export function LiveDashboard({ canRotateKey, signedIn }: { canRotateKey: boolean; signedIn: boolean }) {
  const [events, setEvents] = useState<LiveEventSummary[] | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [data, setData] = useState<LiveGraphicsPayload | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);
  const { offset, sample } = useServerOffset();
  const [tab, setTab] = useState<Tab>("scoreboard");
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  // The board on screen is always the last server board plus the actions not yet saved.
  const serverBoardRef = useRef<ScoreboardState | null>(null);
  const queueRef = useRef<QueuedAction[]>([]);
  const inFlightRef = useRef(false);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryCountRef = useRef(0);
  const eventIdRef = useRef<string | null>(null);
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/live/events", { cache: "no-store" })
      .then((response) => readJson<{ events: LiveEventSummary[] }>(response))
      .then(({ events: list }) => {
        if (cancelled) return;
        setEvents(list);
        setEventId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((caught: Error) => !cancelled && setError(`Couldn't load livestreams: ${caught.message}`));
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    eventIdRef.current = eventId;
    serverBoardRef.current = null;
    setData(null);
    setScoreboard(null);
    if (!eventId) return;
    loadEvent(eventId).catch((caught: Error) => {
      if (eventIdRef.current === eventId) setError(`Couldn't load this livestream: ${caught.message}`);
    });
  }, [eventId, loadEvent]);

  // Pick up changes from another device (a second operator) whenever nothing is waiting to save.
  useEffect(() => {
    if (!eventId) return;
    const id = window.setInterval(() => {
      if (document.hidden || inFlightRef.current || queueRef.current.length) return;
      loadEvent(eventId).catch(() => undefined);
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
      setError(null);
      applyPayload(payload, sentAt);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown error";
      if (isRetryable(caught)) {
        const wait = RETRY_MS[Math.min(retryCountRef.current, RETRY_MS.length - 1)];
        retryCountRef.current += 1;
        setError(`Couldn't save the scoreboard (${message}). Retrying in ${wait / 1000}s. OBS shows the last saved score until then.`);
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = undefined;
          void flush();
        }, wait);
      } else {
        queueRef.current = queueRef.current.filter((entry) => !batch.includes(entry));
        setError(`That change wasn't saved: ${message}`);
        if (batchEvent === eventIdRef.current) loadEvent(batchEvent).catch(() => undefined);
      }
    } finally {
      inFlightRef.current = false;
      if (queueRef.current.length && retryTimerRef.current === undefined) void flush();
    }
  }, [applyPayload, loadEvent]);

  useEffect(() => () => window.clearTimeout(retryTimerRef.current), []);

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
        setError(`Couldn't update the live image: ${caught instanceof Error ? caught.message : "unknown error"}. Try again.`);
      }
    },
    [eventId, sample]
  );

  async function rotateKey() {
    if (!eventId || !window.confirm("Make new OBS links for this livestream? The old links stop working right away.")) return;
    const sentAt = Date.now();
    try {
      applyPayload(await readJson<LiveGraphicsPayload>(await fetch(`/api/live/events/${eventId}/key`, { method: "POST" })), sentAt);
    } catch (caught) {
      setError(`Couldn't make new links: ${caught instanceof Error ? caught.message : "unknown error"}.`);
    }
  }

  const overlayBase = data ? `${origin}/live/${data.overlayKey}` : "";

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b-4 border-[var(--brand-fill)] bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 md:px-6">
          <BrandWordmark className="h-8 w-auto object-contain" priority />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-green">InFocus Live</p>
            <h1 className="text-2xl font-semibold tracking-tight">Livestream dashboard</h1>
          </div>
          {signedIn ? (
            <a href="/livestreams" className="text-sm text-muted-foreground hover:text-foreground">
              Back to Livestreams
            </a>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="grid min-w-0 flex-1 gap-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground sm:max-w-xl">
            Livestream
            <select
              id="live-event"
              value={eventId ?? ""}
              onChange={(event) => setEventId(event.target.value || null)}
              className="h-9 rounded-md border border-input bg-background px-3 text-base normal-case tracking-normal text-foreground sm:text-sm"
            >
              {events === null ? <option value="">Loading…</option> : null}
              {events?.length === 0 ? <option value="">No upcoming livestreams</option> : null}
              {events?.map((event) => (
                <option key={event.id} value={event.id}>
                  {formatEventOption(event)}
                </option>
              ))}
            </select>
          </label>
          <Seg label="Dashboard tab" value={tab} options={TABS} onChange={setTab} />
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-[var(--danger)] bg-danger-tint px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {events?.length === 0 ? (
          <p className="text-muted-foreground">
            There are no livestreams from the last 12 hours or the next 45 days. Add one on the Livestreams page.
          </p>
        ) : null}

        {data && scoreboard ? (
          <>
            {tab === "thumbnail" ? <ThumbnailPanel key={data.event.id} event={data.event} /> : null}
            {tab === "scoreboard" ? (
              <ScoreboardPanel
                scoreboard={scoreboard}
                dispatch={dispatch}
                offset={offset}
                overlayUrl={`${overlayBase}/scoreboard`}
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
              />
            ) : null}
            {canRotateKey && tab !== "thumbnail" ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>Link shared somewhere it shouldn&apos;t be?</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void rotateKey()}>
                  Make new OBS links
                </Button>
              </div>
            ) : null}
          </>
        ) : eventId && !error ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : null}
      </div>
    </main>
  );
}
