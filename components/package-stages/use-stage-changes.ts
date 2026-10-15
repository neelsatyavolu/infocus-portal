"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CycleStageStatus } from "@/src/lib/package-stage-status";

type StageSlug = "brainstorming" | "a-roll" | "initial-cut" | "final-cut";
export type SeenStatuses = Partial<Record<StageSlug, CycleStageStatus>>;

const STORAGE_KEY = "infocus:ui:package-stages:seen:v1";

/**
 * The storage key for a viewer's record. With an email, each person gets their own record, so
 * another student on a shared browser (or View as) never compares against it; the email is hashed
 * (FNV-1a) so it never sits in storage in plain text. Without one, every viewer of this browser
 * shares the bare key.
 */
export function seenStatusesKey(viewer: string | null | undefined) {
  const id = viewer?.trim().toLowerCase();
  if (!id) return STORAGE_KEY;
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193);
  }
  return `${STORAGE_KEY}:${(hash >>> 0).toString(36)}`;
}

/** Statuses someone else's action produces (a review). Pending, locked and submitted never flag. */
const NOTEWORTHY = new Set<CycleStageStatus>([
  "approved",
  "stage-1-approved",
  "needs-revisions",
  "stage-2",
  "stage-3",
  "queued"
]);

function readSeen(key: string): SeenStatuses {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SeenStatuses) : {};
  } catch {
    return {};
  }
}

function writeSeen(key: string, seen: SeenStatuses) {
  try {
    window.localStorage.setItem(key, JSON.stringify(seen));
  } catch {
    // Storage blocked or full: changes just won't be remembered for this viewer.
  }
}

/**
 * The pure rule behind useStageChanges: the open stage and first-seen stages are recorded
 * quietly; a stage whose status turned into a review result (NOTEWORTHY) since it was last
 * seen is flagged and stays unseen until opened; any other change is recorded without a flag.
 */
export function nextSeenStatuses(
  seen: SeenStatuses,
  statuses: Partial<Record<StageSlug, CycleStageStatus>>,
  activeSlug: StageSlug | null
): { seen: SeenStatuses; flagged: Set<StageSlug> } {
  const next: SeenStatuses = { ...seen };
  const flagged = new Set<StageSlug>();
  for (const [slug, status] of Object.entries(statuses) as Array<[StageSlug, CycleStageStatus | undefined]>) {
    if (!status) continue;
    const previous = seen[slug];
    if (slug === activeSlug || previous === undefined) {
      next[slug] = status;
    } else if (previous !== status && NOTEWORTHY.has(status)) {
      flagged.add(slug);
    } else if (previous !== status) {
      // A change the viewer caused (an upload) or a reset: record it without flagging.
      next[slug] = status;
    }
  }
  return { seen: next, flagged };
}

/**
 * Which stages changed status since they were last opened in this browser, e.g. A-roll/B-roll
 * turned APPROVED or REVISIONS. The open stage is marked seen; a stage seen for the first time is
 * recorded quietly, so nothing flags on a first visit. Needs no server data. The record is per
 * browser unless `viewer` (the signed-in or viewed-as email) is passed, which keeps each person's
 * record apart.
 */
export function useStageChanges(
  statuses: Partial<Record<StageSlug, CycleStageStatus>> | null,
  activeSlug: StageSlug | null,
  viewer?: string | null
): ReadonlySet<StageSlug> {
  const key = seenStatusesKey(viewer);
  // Flagged stages are never written to the record, so reading it again after the write below
  // flags the same stages. The server (and hydration) sees no record, so nothing flags there.
  const flaggedList = useSyncExternalStore(
    subscribeNever,
    () => (statuses ? [...nextSeenStatuses(readSeen(key), statuses, activeSlug).flagged].join(",") : ""),
    () => ""
  );
  const changed = useMemo<ReadonlySet<StageSlug>>(
    () => new Set(flaggedList ? (flaggedList.split(",") as StageSlug[]) : []),
    [flaggedList]
  );

  useEffect(() => {
    if (!statuses) return;
    writeSeen(key, nextSeenStatuses(readSeen(key), statuses, activeSlug).seen);
  }, [statuses, activeSlug, key]);

  return changed;
}

/** The record is re-read on each render; nothing outside this hook needs to wake it. */
function subscribeNever() {
  return () => {};
}
