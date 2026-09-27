"use client";

import { createContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { STORY_HEIGHT, STORY_SAFE_BAND, STORY_WIDTH, fitScale } from "@/src/lib/story-maker";
import { cn } from "@/src/lib/utils";
import "./story-maker.css";

const SAFE_PERCENT = `${(STORY_SAFE_BAND / STORY_HEIGHT) * 100}%`;

/** Screen pixels per story pixel in the preview (for dragging in the Custom template). */
export const StoryScaleContext = createContext(1);

/** A 9:16 frame that scales its 1080 × 1920 child to fit, with optional Instagram UI zones on top. */
export function StoryFrame({ showSafeZones, children }: { showSafeZones: boolean; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientWidth / STORY_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="relative mx-auto aspect-[9/16] w-full max-w-[min(100%,calc((100dvh-15rem)*9/16))] min-w-[240px] overflow-hidden rounded-md border border-border bg-[#0F110F]"
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: STORY_WIDTH, height: STORY_HEIGHT, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      >
        <StoryScaleContext.Provider value={scale || 1}>{children}</StoryScaleContext.Provider>
      </div>
      {showSafeZones
        ? (["top-0 border-b", "bottom-0 border-t"] as const).map((position) => (
            <div
              key={position}
              aria-hidden="true"
              className={cn("pointer-events-none absolute inset-x-0 grid place-items-center border-dashed border-[#F2A516] bg-[#F2A516]/25", position)}
              style={{ height: SAFE_PERCENT }}
            >
              <span className="rounded bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.11em] text-[#F2A516] light:text-[#B45309]">
                Instagram covers this
              </span>
            </div>
          ))
        : null}
    </div>
  );
}

/**
 * The story artwork. After each render, every [data-fit] box shrinks its text (down to 75%) until it
 * fits, and `onOverflowChange` reports text that still doesn't.
 */
export function StoryCanvas({
  storyRef,
  exporting,
  fitKey,
  onOverflowChange,
  children
}: {
  storyRef: RefObject<HTMLDivElement | null>;
  exporting: boolean;
  /** Changes whenever the content changes, so fitting re-runs. */
  fitKey: unknown;
  onOverflowChange: (overflow: boolean) => void;
  children: ReactNode;
}) {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const root = storyRef.current;
    if (!root) return;
    let overflow = false;
    root.querySelectorAll<HTMLElement>("[data-fit]").forEach((box) => {
      const result = fitScale((scale) => {
        box.style.setProperty("--k", String(scale));
        return box.scrollHeight;
      }, Number(box.dataset.fit));
      overflow ||= result.overflow;
    });
    onOverflowChange(overflow);
  }, [storyRef, fitKey, fontsReady, onOverflowChange]);

  return (
    <div ref={storyRef} className={cn("sm-story", exporting && "sm-exporting")}>
      {children}
    </div>
  );
}
