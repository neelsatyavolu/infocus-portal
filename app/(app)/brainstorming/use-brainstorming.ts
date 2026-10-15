"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import {
  brainstormScreen,
  mapPackage,
  type BrainstormPackage,
  type BrainstormPayload,
  type BrainstormView
} from "./brainstorm-view";

/** The cycle a param-less load resolved to (the viewer's current cycle), so its copy is found under one key. */
const CURRENT_CYCLE_KEY = "brainstorming:current";
const cacheKey = (cycle: number) => `brainstorming:${cycle}`;
const LOAD_FAILED = "Failed to load brainstorming.";

async function fetchPayload(cycle: number | null) {
  const response = await fetch(`/api/brainstorming${cycle !== null ? `?cycle=${cycle}` : ""}`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as { data?: BrainstormPayload; error?: { message?: string } } | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error?.message ?? LOAD_FAILED);
  }
  return body.data;
}

/**
 * The copy a load of `urlCycle` would show at once, if this tab has one. Safe to read while
 * rendering: the cache is in memory and empty on a full page load, on the server and the client alike.
 */
export function cachedPayload(urlCycle: number | null) {
  const target = urlCycle ?? cachedValue<number>(CURRENT_CYCLE_KEY) ?? null;
  return target !== null ? cachedValue<BrainstormPayload>(cacheKey(target)) : undefined;
}

/**
 * The page's data: GET /api/brainstorming for ?cycle (or the current cycle). A visit shows the
 * cached copy at once and refreshes it quietly (src/lib/client-cache.ts). Answers that arrive
 * out of order are dropped, and when an upload, removal or save lands while a load is in flight,
 * that load fetches again so an older answer never overwrites the change.
 */
export function useBrainstorming(urlCycle: number | null) {
  const [view, setView] = useState<BrainstormView | null>(null);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const editSeq = useRef(0);
  const dataOnScreen = useRef(false);

  const load = useCallback(async function run(requested: number | null, options?: { cached?: boolean }): Promise<void> {
    const seq = ++requestSeq.current;
    const editsAtStart = editSeq.current;
    const knownCurrent = cachedValue<number>(CURRENT_CYCLE_KEY) ?? null;
    if (knownCurrent !== null) setCurrentCycle(knownCurrent);
    const target = requested ?? knownCurrent;
    const cached = options?.cached && target !== null ? cachedValue<BrainstormPayload>(cacheKey(target)) : undefined;
    setError(null);
    if (cached) {
      setView({ payload: cached, requested });
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchPayload(requested);
      if (seq !== requestSeq.current) return; // a newer request owns the screen
      if (editSeq.current !== editsAtStart) {
        // A change landed on screen meanwhile and this answer may predate it: ask again.
        void run(requested);
        return;
      }
      if (requested === null) {
        rememberValue(CURRENT_CYCLE_KEY, data.activeCycleNumber);
        setCurrentCycle(data.activeCycleNumber);
      }
      setView({ payload: data, requested });
    } catch (loadError) {
      if (seq !== requestSeq.current) return;
      const message = loadError instanceof Error ? loadError.message : LOAD_FAILED;
      setError(message);
      // With nothing on screen the page shows the error inline; otherwise the copy stays and a toast says so.
      if (dataOnScreen.current) toast.error(message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(urlCycle, { cached: true });
  }, [load, urlCycle]);

  // Every change on screen (a load, upload, removal or doc save) becomes the copy a return visit shows.
  useEffect(() => {
    if (view) rememberValue(cacheKey(view.payload.activeCycleNumber), view.payload);
  }, [view]);

  const screen = brainstormScreen(view, urlCycle ?? currentCycle, error);

  useEffect(() => {
    dataOnScreen.current = screen.state === "ready";
  }, [screen.state]);

  /** Applies a saved change to one package on screen. */
  const updatePackage = useCallback((packageId: string, update: (pkg: BrainstormPackage) => BrainstormPackage) => {
    editSeq.current += 1;
    setView((current) => {
      if (!current) return current;
      const next = mapPackage(current.payload, packageId, update);
      return next === current.payload ? current : { ...current, payload: next };
    });
  }, []);

  return {
    payload: view?.payload ?? null,
    currentCycle,
    loading,
    error,
    ...screen,
    load,
    updatePackage
  };
}
