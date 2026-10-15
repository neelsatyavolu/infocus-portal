/**
 * The newest Slack #announcements post this browser has seen. The feed records it when it opens
 * and reveals a "New" tag on each post newer than the last visit. Every storage read and write is
 * wrapped, so blocked storage only loses the tags.
 */
export const ANNOUNCEMENTS_LAST_SEEN_TS_KEY = "infocus:announcements:last-seen-ts";
/** Class on each feed post's hidden "New" tag; NewPostsMarker reveals the new ones. */
export const NEW_POST_TAG_CLASS = "new-post-tag";

const TS_PATTERN = /^\d+(\.\d+)?$/;

/** True for a Slack message timestamp ("1760541600.123456"). */
export function isSlackTs(value: string) {
  return TS_PATTERN.test(value);
}

/** Slack message timestamps compared without float rounding. */
export function compareSlackTs(a: string, b: string) {
  const [aWhole = "0", aFraction = ""] = a.split(".");
  const [bWhole = "0", bFraction = ""] = b.split(".");
  const whole = Number(aWhole) - Number(bWhole);
  if (whole !== 0) return whole;
  return aFraction.padEnd(6, "0").localeCompare(bFraction.padEnd(6, "0"));
}

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The newest post this browser has seen, or null on a first visit (or blocked storage). */
export function readLastSeenTs(): string | null {
  try {
    const value = storage()?.getItem(ANNOUNCEMENTS_LAST_SEEN_TS_KEY);
    return value && isSlackTs(value) ? value : null;
  } catch {
    return null;
  }
}

/** Records the newest post on screen; never moves the mark backwards. */
export function markAnnouncementsSeen(newestTs: string | null) {
  if (!newestTs || !isSlackTs(newestTs)) return;
  try {
    const previous = readLastSeenTs();
    if (!previous || compareSlackTs(newestTs, previous) > 0) {
      storage()?.setItem(ANNOUNCEMENTS_LAST_SEEN_TS_KEY, newestTs);
    }
  } catch {
    // Storage full or blocked: the tags just won't be remembered.
  }
}
