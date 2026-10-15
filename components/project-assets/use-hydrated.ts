"use client";

import { useSyncExternalStore } from "react";
import { SERVER_DATE_ZONE, type DateZone } from "@/components/project-assets/format";

const VIEWER_DATE_ZONE: DateZone = {};

function subscribe() {
  return () => {};
}

/** False on the server and during hydration, true after. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

/**
 * Locale and time zone for dates and name lists: the server's fixed one until hydrated (so the
 * hydrated text matches), then the viewer's own.
 */
export function useDateZone() {
  return useHydrated() ? VIEWER_DATE_ZONE : SERVER_DATE_ZONE;
}
