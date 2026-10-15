"use client";

import { useEffect, useState } from "react";

/** Slack catch-up runs at most once per tab in this window. */
const SLACK_SYNC_MIN_MS = 10 * 60_000;
const SLACK_SYNC_STORAGE_KEY = "infocus:slack-sync-at";

function runWhenIdle(callback: () => void, timeoutMs: number) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    const id = idleWindow.requestIdleCallback(callback, { timeout: timeoutMs });
    return () => idleWindow.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 1_000);
  return () => window.clearTimeout(id);
}

/** True when this tab already ran the Slack catch-up recently; records the run otherwise. */
function slackSyncedRecently() {
  try {
    const last = Number(window.sessionStorage.getItem(SLACK_SYNC_STORAGE_KEY));
    if (Number.isFinite(last) && Date.now() - last < SLACK_SYNC_MIN_MS) {
      return true;
    }
    window.sessionStorage.setItem(SLACK_SYNC_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage blocked (private mode): sync on every load, as before.
  }
  return false;
}

/** Best-effort Slack catch-up when the browser is idle (not for the App Review account). */
export function useSlackCatchUp(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return runWhenIdle(() => {
      if (slackSyncedRecently()) return;
      void fetch("/api/slack/sync", { method: "POST", cache: "no-store" }).catch(() => {
        /* Slack catch-up is best-effort */
      });
    }, 3_000);
  }, [enabled]);
}

/** Meetings live on their own host (meet.infocuspaly.com), where "/" is the Meetings tab. */
export function useOnMeetHost() {
  const [onMeetHost, setOnMeetHost] = useState(false);
  useEffect(() => setOnMeetHost(window.location.hostname.startsWith("meet.")), []);
  return onMeetHost;
}

const TOAST_OFFSET = "calc(3.75rem + env(safe-area-inset-bottom, 0px) + 1rem)";

/** Toasts clear the phone tab bar (set on <html>, where the Toaster reads it). */
export function useToastOffset(hasPhoneTabs: boolean) {
  useEffect(() => {
    if (!hasPhoneTabs) return;
    const root = document.documentElement;
    const media = window.matchMedia("(max-width: 1023.98px)");
    const apply = () => {
      if (media.matches) root.style.setProperty("--toast-offset-bottom", TOAST_OFFSET);
      else root.style.removeProperty("--toast-offset-bottom");
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      root.style.removeProperty("--toast-offset-bottom");
    };
  }, [hasPhoneTabs]);
}
