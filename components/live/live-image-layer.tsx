import { useEffect, useState, type ReactNode } from "react";
import type { LiveImageState } from "@/src/lib/live/graphics";

/** Matches the exit keyframes in live.css (the longest one ends at 0.8s). */
const EXIT_MS = 800;

type Shown = { image: NonNullable<LiveImageState>; leaving: boolean } | null;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shows the pushed graphic. When it is cleared or replaced, the old one plays its exit
 * (DESIGN.md §5: roughly the entrance in reverse) before the next one builds in.
 */
export function LiveImageLayer({ liveImage, render }: { liveImage: LiveImageState; render: (image: NonNullable<LiveImageState>) => ReactNode }) {
  const [shown, setShown] = useState<Shown>(liveImage ? { image: liveImage, leaving: false } : null);
  const incomingKey = liveImage?.pushedAt ?? null;

  useEffect(() => {
    setShown((current) => {
      if (current && current.image.pushedAt === incomingKey) return current.leaving ? { ...current, leaving: false } : current;
      if (!current) return liveImage ? { image: liveImage, leaving: false } : null;
      return current.leaving ? current : { ...current, leaving: true };
    });
    // liveImage is keyed by pushedAt; field edits never change a pushed graphic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  const leaving = shown?.leaving ?? false;
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setShown(liveImage ? { image: liveImage, leaving: false } : null), prefersReducedMotion() ? 0 : EXIT_MS);
    return () => window.clearTimeout(id);
    // Re-read the latest pushed graphic when the exit finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving, incomingKey]);

  if (!shown) return null;
  return (
    <div key={shown.image.pushedAt} className={shown.leaving ? "lv-exit" : "lv-play"}>
      {render(shown.image)}
    </div>
  );
}
