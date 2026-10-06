"use client";

import { useSyncExternalStore } from "react";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// One shared minute ticker for every <RelativeAge>, so only these labels re-render, not their page.
const listeners = new Set<() => void>();
let nowMs = 0;
let timerId: number | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    nowMs = Date.now();
    timerId = window.setInterval(() => {
      nowMs = Date.now();
      listeners.forEach((notify) => notify());
    }, MINUTE_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timerId);
      timerId = undefined;
    }
  };
}

const getSnapshot = () => nowMs;
// Server render and hydration show nothing, matching the old `nowMs === 0` behavior.
const getServerSnapshot = () => 0;

export function ageLabelFromDate(isoDate: string, now: number) {
  if (now === 0) {
    return "";
  }
  const diffMs = Math.max(0, now - new Date(isoDate).getTime());
  const diffDays = Math.floor(diffMs / DAY_MS);
  if (diffDays >= 1) {
    return `${diffDays}d`;
  }
  const diffHours = Math.floor(diffMs / HOUR_MS);
  if (diffHours >= 1) {
    return `${diffHours}h`;
  }
  return `${Math.max(1, Math.floor(diffMs / MINUTE_MS))}m`;
}

/** Compact "3d" / "5h" / "2m" age that refreshes itself every minute. */
export function RelativeAge({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return <>{ageLabelFromDate(iso, now)}</>;
}
