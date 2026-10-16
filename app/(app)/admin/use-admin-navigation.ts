"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";
import {
  VIEW_STORAGE_KEY,
  isAdminView,
  parseOAuthReturn,
  resolveInitialView,
  resolveTarget,
  type AdminView,
  type OAuthResult
} from "./admin-views";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function urlWith(search: string, hash: string) {
  return `${window.location.pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

function replaceUrl(search: string, hash: string) {
  window.history.replaceState(null, "", urlWith(search, hash));
}

/** A new history entry, so Back returns to where the link was followed (like the old #section links). */
function pushUrl(search: string, hash: string) {
  window.history.pushState(null, "", urlWith(search, hash));
}

function currentSearch() {
  return window.location.search.replace(/^\?/, "");
}

export type OAuthResults = { youtube: OAuthResult | null; googleCalendar: OAuthResult | null };

const NO_OAUTH: OAuthResults = { youtube: null, googleCalendar: null };

type ScrollTarget = { id: string; nonce: number };
type InitialNavigation = {
  view: AdminView;
  section: string | null;
  oauth: OAuthResults;
  oauthSearch: string | null;
  scrollTarget: ScrollTarget | null;
};

/** The first view, from a Google sign-in return, the link's #hash, or the view remembered here. */
function resolveInitialNavigation(canSystem: boolean): InitialNavigation {
  const parsed = parseOAuthReturn(window.location.search);
  const oauthReturn = Boolean(parsed.youtube || parsed.googleCalendar);
  const target = resolveInitialView({
    hash: window.location.hash,
    stored: readRemembered(storage(), VIEW_STORAGE_KEY, null, isAdminView),
    canSystem,
    oauthReturn
  });
  return {
    view: target.view,
    section: target.section ?? null,
    oauth: oauthReturn ? { youtube: parsed.youtube, googleCalendar: parsed.googleCalendar } : NO_OAUTH,
    oauthSearch: oauthReturn ? parsed.search : null,
    scrollTarget: target.section ? { id: target.section, nonce: Date.now() } : null
  };
}

/**
 * Resolves the first view once, during render on the client (so a client-side visit renders the
 * right view first), and keeps it. The server and hydration render show Overview, as before.
 */
function createInitialStore() {
  let value: InitialNavigation | null = null;
  return {
    get(canSystem: boolean) {
      value ??= resolveInitialNavigation(canSystem);
      return value;
    },
    subscribe() {
      return () => {};
    }
  };
}

/**
 * Which Admin view is open. The first view comes from a Google sign-in return (System), the
 * link's #hash, the view remembered in this browser, or Overview, and is written to the URL as
 * #<view>. Tabs replace #<view>; links to a section (#backups, #access-requests, …) add a history
 * entry, switch view and then scroll to it once it is visible, so Back returns to where you were.
 */
export function useAdminNavigation({ enabled, canSystem }: { enabled: boolean; canSystem: boolean }) {
  const [initialStore] = useState(createInitialStore);
  const initial = useSyncExternalStore(
    initialStore.subscribe,
    useCallback(() => (enabled ? initialStore.get(canSystem) : null), [initialStore, enabled, canSystem]),
    () => null
  );
  // Set by tabs and links after the first view; until then the resolved first view shows.
  const [pickedView, setView] = useState<AdminView | null>(null);
  const [pickedScrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  const [dismissed, setDismissed] = useState<Partial<Record<keyof OAuthResults, true>>>({});
  const resolvedRef = useRef(false);

  const view = pickedView ?? initial?.view ?? "overview";
  const scrollTarget = pickedScrollTarget ?? initial?.scrollTarget ?? null;
  const initialOauth = initial?.oauth ?? NO_OAUTH;
  const oauth = useMemo<OAuthResults>(
    () => ({
      youtube: dismissed.youtube ? null : initialOauth.youtube,
      googleCalendar: dismissed.googleCalendar ? null : initialOauth.googleCalendar
    }),
    [initialOauth, dismissed]
  );

  const show = useCallback((next: AdminView) => {
    setView(next);
    writeRemembered(storage(), VIEW_STORAGE_KEY, next);
  }, []);

  // Before paint: write the first view to the URL and remember it.
  useLayoutEffect(() => {
    if (!initial || resolvedRef.current) return;
    resolvedRef.current = true;
    if (initial.oauthSearch !== null) {
      replaceUrl(initial.oauthSearch, initial.section ?? window.location.hash.replace(/^#/, ""));
    } else if (!window.location.hash) {
      // So Back from a section link lands on this view again.
      replaceUrl(currentSearch(), initial.view);
    }
    writeRemembered(storage(), VIEW_STORAGE_KEY, initial.view);
  }, [initial]);

  // Scroll only after the view's panel has lost `hidden`; scrolling inside a hidden panel does nothing.
  useEffect(() => {
    if (!scrollTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(scrollTarget.id)?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollTarget]);

  /** Opens the view that holds `id` and scrolls to it (header links, status strip, #links). */
  const goTo = useCallback(
    (id: string, { updateUrl = true }: { updateUrl?: boolean } = {}) => {
      const target = resolveTarget(id, canSystem);
      if (!target) return;
      show(target.view);
      const hash = id.replace(/^#/, "");
      if (updateUrl && window.location.hash.replace(/^#/, "") !== hash) pushUrl(currentSearch(), hash);
      if (target.section) setScrollTarget({ id: target.section, nonce: Date.now() });
    },
    [canSystem, show]
  );

  /** A tab click: switch views and keep the choice in the URL. */
  const selectView = useCallback(
    (next: AdminView) => {
      show(next);
      replaceUrl(currentSearch(), next);
    },
    [show]
  );

  // Links followed while already on Admin (#backups from a doc, the assistant, an edited URL),
  // and Back / Forward between the entries section links add.
  useEffect(() => {
    if (!enabled) return;
    function onHashChange() {
      goTo(window.location.hash, { updateUrl: false });
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [enabled, goTo]);

  const dismissOauth = useCallback((key: keyof OAuthResults) => {
    setDismissed((current) => ({ ...current, [key]: true }));
  }, []);

  return {
    view: view === "system" && !canSystem ? ("overview" as const) : view,
    selectView,
    goTo,
    oauth,
    dismissOauth
  };
}
