"use client";

import { useEffect, useState } from "react";
import {
  compareSlackTs,
  isSlackTs,
  markAnnouncementsSeen,
  NEW_POST_TAG_CLASS,
  readLastSeenTs
} from "@/components/announcements/announcements-seen";

/**
 * Records this visit to the feed and reveals the hidden "New" tag of each post newer than the
 * last visit with one small style rule, so the server-rendered feed needs no client code per
 * post. First visit (nothing stored): no tags.
 */
export function NewPostsMarker({ newestTs }: { newestTs: string | null }) {
  // Read once, before this visit records itself. A lazy initializer keeps the same value when
  // Strict Mode re-runs the effect below.
  const [previous] = useState(() => (typeof window === "undefined" ? null : readLastSeenTs()));
  const [newTs, setNewTs] = useState<string[]>([]);

  useEffect(() => {
    if (previous) {
      const found = Array.from(document.querySelectorAll<HTMLElement>("[data-post-ts]"))
        .map((element) => element.dataset.postTs ?? "")
        .filter((ts) => isSlackTs(ts) && compareSlackTs(ts, previous) > 0);
      setNewTs(found);
    }
    markAnnouncementsSeen(newestTs);
  }, [previous, newestTs]);

  if (newTs.length === 0) return null;
  const css = newTs.map((ts) => `[data-post-ts="${ts}"] .${NEW_POST_TAG_CLASS}{display:inline-flex}`).join("");
  return <style>{css}</style>;
}
