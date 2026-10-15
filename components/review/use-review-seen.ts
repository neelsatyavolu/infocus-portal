"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";

/**
 * "What happened since I last looked": when this browser last viewed the media item and each of
 * its versions. Kept in localStorage (wrapped in try/catch by the kit helpers); a private window or
 * blocked storage just means nothing is marked new.
 */
export type ReviewSeenRecord = {
  visitedAt: string;
  versions: Record<string, string>;
};

function isSeenRecord(value: unknown): value is ReviewSeenRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ReviewSeenRecord>;
  return (
    typeof record.visitedAt === "string" &&
    !!record.versions &&
    typeof record.versions === "object" &&
    Object.values(record.versions).every((entry) => typeof entry === "string")
  );
}

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readRecord(key: string) {
  const value = readRemembered<unknown>(storage(), key, null);
  return isSeenRecord(value) ? value : null;
}

/** The last-seen time a version's comments are compared against. */
export function versionBaseline(record: ReviewSeenRecord | null, versionId: string) {
  return record ? (record.versions[versionId] ?? record.visitedAt) : null;
}

/** A version uploaded after the last visit that this browser hasn't opened yet. */
export function isVersionNewSince(record: ReviewSeenRecord | null, version: { id: string; createdAt: string }) {
  return Boolean(record && !record.versions[version.id] && version.createdAt > record.visitedAt);
}

export function markSeen(record: ReviewSeenRecord | null, versionId: string, nowIso: string): ReviewSeenRecord {
  return { visitedAt: nowIso, versions: { ...(record?.versions ?? {}), [versionId]: nowIso } };
}

/**
 * Reads the record once after mount (so "New" marks stay put while the page is open) and writes
 * the current version as seen when the viewer switches version, hides the tab or leaves.
 */
export function useReviewSeen(mediaId: string, currentVersionId: string) {
  const key = `review:seen:v1:${mediaId}`;
  const [snapshot, setSnapshot] = useState<ReviewSeenRecord | null>(null);
  const currentRef = useRef(currentVersionId);
  const readOnceRef = useRef(false);

  const write = useCallback(
    (versionId: string) => {
      if (!versionId) return;
      writeRemembered(storage(), key, markSeen(readRecord(key), versionId, new Date().toISOString()));
    },
    [key]
  );

  // Read once: the record is rewritten as the viewer leaves, and the marks must not vanish mid-visit.
  useEffect(() => {
    if (readOnceRef.current) return;
    readOnceRef.current = true;
    setSnapshot(readRecord(key));
  }, [key]);

  // Switching version marks the one being left as seen.
  useEffect(() => {
    const previous = currentRef.current;
    if (previous !== currentVersionId) {
      write(previous);
      currentRef.current = currentVersionId;
    }
  }, [currentVersionId, write]);

  useEffect(() => {
    const flush = () => write(currentRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [write]);

  return snapshot;
}
