"use client";

import { createContext, useCallback, useContext } from "react";

/**
 * True inside the InFocus iPhone app's web view (`?app=1`, the embedded cookie, or its user agent).
 * The app shows its own close button, so the call hides web chrome and "back" links, and leaving
 * goes to `/meetings?left=1`, which the app intercepts to close the view.
 */
const MeetEmbedContext = createContext(false);

export const MeetEmbedProvider = MeetEmbedContext.Provider;

export function useMeetEmbedded() {
  return useContext(MeetEmbedContext);
}

export const APP_LEAVE_URL = "/meetings?left=1";

/** Leaves the call page: web stays on the end screen, the app is sent to its close URL. */
export function useExitCall() {
  const embedded = useMeetEmbedded();
  return useCallback(() => {
    // A real navigation (not client-side routing) so the app's navigation delegate sees it.
    if (embedded) window.location.replace(APP_LEAVE_URL);
  }, [embedded]);
}
