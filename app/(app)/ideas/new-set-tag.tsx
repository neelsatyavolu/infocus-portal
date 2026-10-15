"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";

const RUN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The newest set this person has opened ("YYYY-MM-DD"), per browser and per signed-in person (View as
 * gets its own). Stored through the kit, so the full localStorage key is `infocus:ui:ideas:seen:v1:<userId>`.
 */
export function ideasSeenKey(viewerId: string) {
  return `ideas:seen:v1:${viewerId}`;
}

function isRunDate(value: unknown): value is string {
  return typeof value === "string" && RUN_DATE.test(value);
}

function subscribeNever() {
  return () => undefined;
}

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether the newest set counts as new, and whether to record it as seen. The first visit only
 * records it (nothing is "new" yet); a set already seen changes nothing.
 */
export function newSetState(seen: string | null, latest: string): { isNew: boolean; record: boolean } {
  if (seen !== null && seen >= latest) return { isNew: false, record: false };
  return { isNew: seen !== null, record: true };
}

/**
 * The status tag for the newest set: "Latest", or "New" when this set arrived after the person's
 * last visit. The server renders "Latest", so the page is complete without storage.
 */
export function NewSetTag({ latestRunDate, viewerId }: { latestRunDate: string; viewerId: string }) {
  // False on the server and while hydrating, so the first render matches the server's.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const inputKey = `${viewerId}\n${latestRunDate}`;
  const [state, setState] = useState<{
    inputKey: string | null;
    isNew: boolean;
    write: { key: string; value: string } | null;
  }>({ inputKey: null, isNew: false, write: null });

  // Read while rendering when the inputs change; storage is only written after commit, so a
  // repeated render reads the same stored value.
  if (hydrated && state.inputKey !== inputKey) {
    const key = ideasSeenKey(viewerId);
    const next = newSetState(readRemembered<string | null>(storage(), key, null, isRunDate), latestRunDate);
    setState({
      inputKey,
      isNew: next.record ? next.isNew : state.isNew,
      write: next.record ? { key, value: latestRunDate } : null
    });
  }

  const { write } = state;
  useEffect(() => {
    if (write) writeRemembered(storage(), write.key, write.value);
  }, [write]);

  return state.isNew ? (
    <StatusTag tone="success" dot title="New since your last visit">
      New
    </StatusTag>
  ) : (
    <StatusTag tone="success">Latest</StatusTag>
  );
}
