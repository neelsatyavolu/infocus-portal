"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { overviewCacheKey, type Overview } from "../show-roles/show-overview";

const LOAD_FALLBACK = "Could not load the show.";

/** An overview and the address it belongs to ("" = the next show). */
export type LoadedOverview = { key: string; overview: Overview };

async function readOverview(date: string | undefined): Promise<Overview> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(`/api/show-roles/overview${query}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { data?: Overview; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? LOAD_FALLBACK);
  return payload.data;
}

/**
 * The Show's overview for the date Editing has open: which show `/editing` (no date) means, and the
 * upcoming shows for the date strip. Shares The Show's saved copies (src/lib/client-cache.ts), so a date
 * opened on either page shows at once and refreshes quietly. Only the newest request updates the screen.
 */
export function useEditingOverview(requestedDate: string | undefined, initial: LoadedOverview | null) {
  const key = requestedDate ?? "";
  const [loaded, setLoaded] = useState<LoadedOverview | null>(() => (initial?.key === key ? initial : null));
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const serverCopyRef = useRef(initial?.key === key ? initial : null);
  const requestRef = useRef(0);

  const load = useCallback(async (date: string | undefined, cached: boolean) => {
    const request = ++requestRef.current;
    const address = date ?? "";
    const copy = cached ? cachedValue<Overview>(overviewCacheKey(date)) : undefined;
    if (copy) setLoaded({ key: address, overview: copy });
    try {
      const next = await readOverview(date);
      if (request !== requestRef.current) return;
      rememberValue(overviewCacheKey(next.date), next);
      if (address === "") rememberValue(overviewCacheKey(), next);
      setLoaded({ key: address, overview: next });
      setError(null);
    } catch (failure) {
      if (request !== requestRef.current) return;
      setError({ key: address, message: failure instanceof Error ? failure.message : LOAD_FALLBACK });
    }
  }, []);

  useEffect(() => {
    const serverCopy = serverCopyRef.current;
    serverCopyRef.current = null;
    if (serverCopy && serverCopy.key === key) {
      // Already fresh from the server: keep it as the last copy, like a load would.
      rememberValue(overviewCacheKey(serverCopy.overview.date), serverCopy.overview);
      if (serverCopy.key === "") rememberValue(overviewCacheKey(), serverCopy.overview);
      return;
    }
    void load(requestedDate, true);
  }, [load, key, requestedDate]);

  return {
    overview: loaded?.overview ?? null,
    /** True while the overview on screen belongs to another address. */
    switching: loaded !== null && loaded.key !== key,
    error: error?.key === key ? error.message : null,
    retry: () => load(requestedDate, false)
  };
}
