"use client";

import { useEffect, useState } from "react";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";

/**
 * "New grades" for the sidebar: the last time this person looked at /grades, per browser and per
 * signed-in email (View as gets its own). The first run seeds it, so grades that were already
 * out never light the dot. Storage can be missing (private mode): then nothing is ever "new".
 */

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function seenKey(email: string) {
  return `nav:grades-seen:v1:${email.trim().toLowerCase()}`;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function readGradesSeen(email: string) {
  return readRemembered<number | null>(storage(), seenKey(email), null, isTime);
}

function writeGradesSeen(email: string, at: number) {
  writeRemembered(storage(), seenKey(email), at);
}

/**
 * The seen time after a load: on /grades, or on the first run (nothing stored yet), it moves to
 * now (and past the newest grade), and `write` says to store it; otherwise the stored time stays.
 */
export function nextGradesSeen(input: { stored: number | null; now: number; latest: number | null; onGradesPage: boolean }) {
  if (input.onGradesPage || input.stored === null) {
    return { seenAt: Math.max(input.now, input.latest ?? 0, input.stored ?? 0), write: true };
  }
  return { seenAt: input.stored, write: false };
}

/**
 * The seen time to compare the newest published grade against (null until known).
 * Visiting /grades marks everything up to now as seen.
 */
export function useGradesSeen({
  email,
  latestPublishedAt,
  gradesLoaded,
  onGradesPage
}: {
  email: string | null;
  latestPublishedAt: string | null;
  /** The grades part has loaded at least once (so a null latest means "no grades yet"). */
  gradesLoaded: boolean;
  onGradesPage: boolean;
}) {
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const latest = latestPublishedAt ? Date.parse(latestPublishedAt) : NaN;

  useEffect(() => {
    if (!gradesLoaded || !email) return;
    const next = nextGradesSeen({
      stored: readGradesSeen(email),
      now: Date.now(),
      latest: Number.isFinite(latest) ? latest : null,
      onGradesPage
    });
    if (next.write) writeGradesSeen(email, next.seenAt);
    setSeenAt(next.seenAt);
  }, [email, gradesLoaded, latest, onGradesPage]);

  return seenAt;
}
