"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import type { StageView } from "@/components/package-stages/types";

async function fetchStageView(slug: CycleStageSlug, rowId?: string, reviewStage?: 1 | 2 | 3) {
  const query = new URLSearchParams({ stage: slug });
  if (rowId) query.set("rowId", rowId);
  if (reviewStage) query.set("reviewStage", String(reviewStage));
  const response = await fetch(`/api/package-cycle/stage?${query}`, { cache: "no-store" });
  const body = (await response.json()) as { data?: StageView; error?: { message?: string } };
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Failed to load stage.");
  }
  return body.data;
}

type Loaded = { key: string; data: StageView };

/**
 * Loads one stage view (GET /api/package-cycle/stage).
 * - First view: shows the last copy at once (src/lib/client-cache.ts) and refreshes it quietly.
 *   Only a first load with no copy shows the skeleton (`loading`).
 * - `initialView`: the same view loaded by the server page (src/server/stage-page-view.ts). The
 *   first load takes it instead of fetching; with no copy to show, the page waits for it (the
 *   page's Suspense skeleton), so a full page load arrives with content. It resolves to null on
 *   failure, and the first load then fetches as before.
 * - Every later reload is quiet (`refreshing`), so saves never swap the page for a spinner, and
 *   reloads after a save skip the cache so the pre-save copy never flashes back.
 * - A failed load with no copy sets `error` (the page shows an error state); with a copy it toasts.
 * - Overlapping reloads (e.g. a clip note posted, then the clip closed) are numbered: only the
 *   newest one may update the page or clear `refreshing`, so an older answer never wins.
 */
export function useStageView(
  slug: CycleStageSlug,
  rowId?: string,
  reviewStage?: 1 | 2 | 3,
  initialView?: Promise<StageView | null>
) {
  const cacheKey = `stage-view:${slug}:${rowId ?? ""}:${reviewStage ?? ""}`;
  // The server's copy answers the stage the page was rendered for, once.
  const serverCopy = useRef(initialView ? { key: cacheKey, view: initialView } : null);
  // Read while rendering: the cache is in memory and empty on a full page load, so SSR and hydration agree.
  const [hadCopy] = useState(() => cachedValue<StageView>(cacheKey) !== undefined);
  const firstView = initialView && !hadCopy ? use(initialView) : null;
  const [loaded, setLoaded] = useState<Loaded | null>(() => (firstView ? { key: cacheKey, data: firstView } : null));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const latest = useRef<Loaded | null>(loaded);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (options?: { cached?: boolean }) => {
      const fromServer = serverCopy.current?.key === cacheKey ? serverCopy.current.view : null;
      serverCopy.current = null;
      const seq = ++requestSeq.current;
      const isNewest = () => seq === requestSeq.current;
      const cached = options?.cached ? cachedValue<StageView>(cacheKey) : undefined;
      if (cached) {
        latest.current = { key: cacheKey, data: cached };
        setLoaded(latest.current);
      }
      const hasCopy = latest.current?.key === cacheKey;
      // The server's copy already on screen (no cached copy before it) needs no refresh.
      setRefreshing(hasCopy && !(fromServer && !hadCopy));
      if (!hasCopy) setError(null);
      try {
        const next = (fromServer && (await fromServer)) || (await fetchStageView(slug, rowId, reviewStage));
        if (!isNewest()) return;
        rememberValue(cacheKey, next);
        latest.current = { key: cacheKey, data: next };
        setLoaded(latest.current);
        setError(null);
      } catch (failure) {
        if (!isNewest()) return;
        const message = failure instanceof Error ? failure.message : "Failed to load.";
        if (latest.current?.key === cacheKey) {
          toast.error(message);
        } else {
          setError({ key: cacheKey, message });
        }
      } finally {
        if (isNewest()) setRefreshing(false);
      }
    },
    [cacheKey, slug, rowId, reviewStage, hadCopy]
  );

  useEffect(() => {
    void load({ cached: true });
  }, [load]);

  const reload = useCallback(() => load(), [load]);
  const view = loaded?.key === cacheKey ? loaded.data : null;
  const failed = !view && error?.key === cacheKey ? error.message : null;

  // No copy and no failure for this stage yet: the first load is still running.
  return { view, loading: !view && !failed, refreshing, error: failed, reload };
}
