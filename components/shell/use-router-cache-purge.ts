"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Pages stay in Next's client cache for a short while (`experimental.staleTimes` in
 * next.config.ts), so switching back to a tab shows it at once. Most screens save edits with
 * `fetch("/api/…")` and keep the result in local state, so a cached copy of a page would still
 * show the old data. After a successful Portal write, this refreshes the current page, which
 * also drops every cached page; the next visit renders fresh.
 */

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Writes that run in the background or never change what another page shows. */
const IGNORED_API_PREFIXES = [
  "/api/assistant",
  "/api/auth",
  "/api/hub-chat",
  "/api/live",
  "/api/meetings",
  "/api/nav",
  "/api/platform/calendar/sync",
  "/api/push",
  "/api/slack/sync",
  "/api/teleprompter"
];

/** Waits for a burst of writes (autosave, chunked uploads) to finish before refreshing once. */
const REFRESH_DELAY_MS = 800;

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

function requestHref(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** True for a same-origin write to the Portal API that can change what other pages show. */
export function isPortalWrite(input: RequestInfo | URL, init: RequestInit | undefined, origin: string) {
  if (READ_METHODS.has(requestMethod(input, init))) return false;
  let url: URL;
  try {
    url = new URL(requestHref(input), origin);
  } catch {
    return false;
  }
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) return false;
  return !IGNORED_API_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
  );
}

export function useRouterCachePurge() {
  const router = useRouter();

  useEffect(() => {
    const originalFetch = window.fetch;
    let timer: number | null = null;

    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        router.refresh();
      }, REFRESH_DELAY_MS);
    };

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (response.ok && isPortalWrite(input, init, window.location.origin)) {
        scheduleRefresh();
      }
      return response;
    };

    window.fetch = patchedFetch;
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      // Only restore if nothing else wrapped fetch after us.
      if (window.fetch === patchedFetch) window.fetch = originalFetch;
    };
  }, [router]);
}
