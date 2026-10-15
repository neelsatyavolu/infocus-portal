"use client";

import { useEffect, useRef, useState } from "react";
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
  // The rule depends on the posts in the DOM, so the effect writes it straight into the element.
  const styleRef = useRef<HTMLStyleElement>(null);

  useEffect(() => {
    if (previous && styleRef.current) {
      const found = Array.from(document.querySelectorAll<HTMLElement>("[data-post-ts]"))
        .map((element) => element.dataset.postTs ?? "")
        .filter((ts) => isSlackTs(ts) && compareSlackTs(ts, previous) > 0);
      styleRef.current.textContent = found
        .map((ts) => `[data-post-ts="${ts}"] .${NEW_POST_TAG_CLASS}{display:inline-flex}`)
        .join("");
    }
    markAnnouncementsSeen(newestTs);
  }, [previous, newestTs]);

  return <style ref={styleRef} />;
}
