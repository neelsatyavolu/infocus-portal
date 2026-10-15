"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BoardTag } from "./board-tag";

/** How long a lane shows "Cleared …" after it moves forward. */
const RECENT_CLEAR_MS = 10 * 60 * 1000;

/**
 * "Cleared Init 1" for ten minutes when a lane clears a stage between two refreshes, so the room
 * can see what just happened. Client-only memory of the previous refresh: nothing shows on first
 * load or after the 3-hour reload, and a lane moving back (a withdrawn approval) shows nothing.
 * Always rendered for every lane (even with no label yet) so it remembers across refreshes.
 */
export function RecentClearTag({ doneCount, label }: { doneCount: number; label: string | null }) {
  const previous = useRef(doneCount);
  const [recent, setRecent] = useState<{ label: string; until: number } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = doneCount;
    if (doneCount > before && label) setRecent({ label, until: Date.now() + RECENT_CLEAR_MS });
    else if (doneCount < before) setRecent(null);
  }, [doneCount, label]);

  useEffect(() => {
    if (!recent) return;
    const timer = window.setTimeout(() => setRecent(null), Math.max(0, recent.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [recent]);

  if (!recent) return null;
  return (
    <BoardTag size="lane" tone="success" icon={<Check aria-hidden="true" />}>
      {`Cleared ${recent.label}`}
    </BoardTag>
  );
}
