"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRememberedState } from "@/components/kit/remembered-state";
import {
  latestDocUpdate,
  sectionUpdatedAt,
  type ReformatState,
  type TeleprompterDoc,
  type TeleprompterSection
} from "./teleprompter-model";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element's width in px (null until mounted), kept current with a ResizeObserver. */
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    setWidth(Math.round(node.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** A clock for relative ages ("Synced 2m ago"), ticking every `intervalMs`. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

/** Fake progress for AI reformat and refetch: starts at 8, +9 every 180ms up to 88, 100 on success. */
export function useReformatProgress() {
  const [reformatState, setReformatState] = useState<ReformatState>({
    scope: null,
    targetId: null,
    progress: 0
  });
  const reformatIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (reformatIntervalRef.current !== null) {
        window.clearInterval(reformatIntervalRef.current);
      }
    };
  }, []);

  const startReformatProgress = useCallback((scope: "doc" | "section", targetId: string) => {
    if (reformatIntervalRef.current !== null) {
      window.clearInterval(reformatIntervalRef.current);
    }

    setReformatState({
      scope,
      targetId,
      progress: 8
    });

    reformatIntervalRef.current = window.setInterval(() => {
      setReformatState((current) => {
        if (current.scope !== scope || current.targetId !== targetId) {
          return current;
        }

        return {
          scope: current.scope,
          targetId: current.targetId,
          progress: Math.min(88, current.progress + 9)
        };
      });
    }, 180);
  }, []);

  const clearReformatProgress = useCallback(() => {
    if (reformatIntervalRef.current !== null) {
      window.clearInterval(reformatIntervalRef.current);
      reformatIntervalRef.current = null;
    }
  }, []);

  const finishReformatProgress = useCallback((scope: "doc" | "section", targetId: string) => {
    setReformatState({
      scope,
      targetId,
      progress: 100
    });
    window.setTimeout(() => {
      setReformatState((current) =>
        current.scope === scope && current.targetId === targetId
          ? {
              scope: null,
              targetId: null,
              progress: 0
            }
          : current
      );
    }, 600);
  }, []);

  const resetReformatProgress = useCallback(() => {
    setReformatState({
      scope: null,
      targetId: null,
      progress: 0
    });
  }, []);

  return {
    reformatState,
    startReformatProgress,
    clearReformatProgress,
    finishReformatProgress,
    resetReformatProgress
  };
}

/** Loads a chunk when the browser is idle (or after a short delay where requestIdleCallback is missing, e.g. Safari). */
export function useIdlePreload(enabled: boolean, load: () => Promise<unknown>) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const preload = () => {
      void loadRef.current().catch(() => undefined);
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(timer);
  }, [enabled]);
}

type SeenState = {
  /** When this browser first opened the page; nothing older reads as new. */
  since: number;
  /** Script id → when this browser last had it open. */
  docs: Record<string, number>;
};

const EMPTY_SEEN: SeenState = { since: 0, docs: {} };
const SEEN_LIMIT = 200;

function isSeenState(value: unknown): value is SeenState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SeenState>;
  return typeof candidate.since === "number" && Boolean(candidate.docs) && typeof candidate.docs === "object";
}

function withSeen(current: SeenState, docId: string, at: number): SeenState {
  const entries = Object.entries({ ...current.docs, [docId]: at })
    .sort((left, right) => right[1] - left[1])
    .slice(0, SEEN_LIMIT);
  return { since: current.since, docs: Object.fromEntries(entries) };
}

/**
 * Per-viewer "changed since you last looked" marks, kept in this browser only. A script is new
 * when it (or a section, including automatic name and toss fills) changed after the viewer last
 * had it open. Inside the open script, sections that changed since then are marked too, except
 * the ones this viewer just saved, reformatted or refetched.
 */
export function useSeenDocs(activeDoc: TeleprompterDoc | null, ready: boolean) {
  const [seen, setSeen, loaded] = useRememberedState<SeenState>("teleprompter:seen:v1", EMPTY_SEEN, isSeenState);
  const [view, setView] = useState<{ docId: string; baseline: number } | null>(null);
  const [touched, setTouched] = useState<Record<string, true>>({});
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  });
  const viewDocIdRef = useRef<string | null>(null);
  const activeDocId = activeDoc?.id ?? null;
  const activeVersion = activeDoc ? latestDocUpdate(activeDoc) : 0;

  // First visit in this browser: start the clock after the first load, so the server's own fills
  // during that load don't read as new.
  useEffect(() => {
    if (loaded && ready && !seen.since) {
      setSeen((current) => (current.since ? current : { ...current, since: Date.now() }));
    }
  }, [loaded, ready, seen.since, setSeen]);

  useEffect(() => {
    const stored = seenRef.current;
    if (!loaded || !ready || !activeDocId || !stored.since) {
      return;
    }

    if (viewDocIdRef.current !== activeDocId) {
      viewDocIdRef.current = activeDocId;
      setView({ docId: activeDocId, baseline: stored.docs[activeDocId] ?? stored.since });
      setTouched({});
    }

    setSeen((current) => withSeen(current, activeDocId, Date.now()));
  }, [loaded, ready, activeDocId, activeVersion, seen.since, setSeen]);

  const docUpdatedSinceVisit = useCallback(
    (doc: TeleprompterDoc) => {
      if (!loaded || !seen.since || doc.id === activeDocId) {
        return false;
      }
      return latestDocUpdate(doc) > (seen.docs[doc.id] ?? seen.since);
    },
    [activeDocId, loaded, seen]
  );

  const sectionUpdatedSinceVisit = useCallback(
    (section: TeleprompterSection) =>
      Boolean(view && view.docId === activeDocId && !touched[section.id] && sectionUpdatedAt(section) > view.baseline),
    [activeDocId, touched, view]
  );

  const markTouched = useCallback((sectionIds: string[]) => {
    setTouched((current) => ({ ...current, ...Object.fromEntries(sectionIds.map((id) => [id, true as const])) }));
  }, []);

  return { docUpdatedSinceVisit, sectionUpdatedSinceVisit, markTouched };
}
