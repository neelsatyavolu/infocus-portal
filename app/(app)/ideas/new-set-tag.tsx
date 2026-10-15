"use client";

import { useEffect, useState } from "react";
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
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const store = storage();
    const key = ideasSeenKey(viewerId);
    const next = newSetState(readRemembered<string | null>(store, key, null, isRunDate), latestRunDate);
    if (!next.record) return;
    setIsNew(next.isNew);
    writeRemembered(store, key, latestRunDate);
  }, [latestRunDate, viewerId]);

  return isNew ? (
    <StatusTag tone="success" dot title="New since your last visit">
      New
    </StatusTag>
  ) : (
    <StatusTag tone="success">Latest</StatusTag>
  );
}
