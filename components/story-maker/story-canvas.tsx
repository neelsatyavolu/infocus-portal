"use client";

import { createContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { CANVAS, THEME_BACKGROUND, fitScale, type StoryFormat, type StoryTheme } from "@/src/lib/story-maker";
import { cn } from "@/src/lib/utils";
import "./story-maker.css";

/** Screen pixels per story pixel in the preview (for dragging in the Custom template). */
export const StoryScaleContext = createContext(1);

/**
 * A 4:5 (post) or 9:16 (story) frame that scales its 1080-wide child to fit, with Instagram's UI
 * zones on top when asked (stories only; a feed post has none).
 */
export function StoryFrame({ format, theme, showSafeZones, children }: { format: StoryFormat; theme: StoryTheme; showSafeZones: boolean; children: ReactNode }) {
  const spec = CANVAS[format];
  const safePercent = `${(spec.safeBand / spec.height) * 100}%`;
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setScale(frame.clientWidth / spec.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [spec.width]);

  return (
    <div
      ref={frameRef}
      className={cn(
        "relative mx-auto w-full min-w-[240px] overflow-hidden rounded-md border border-border",
        format === "story" ? "aspect-[9/16] max-w-[min(100%,calc((100dvh-15rem)*9/16))]" : "aspect-[4/5] max-w-[min(100%,calc((100dvh-15rem)*4/5))]"
      )}
      style={{ background: THEME_BACKGROUND[theme] }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: spec.width, height: spec.height, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      >
        <StoryScaleContext.Provider value={scale || 1}>{children}</StoryScaleContext.Provider>
      </div>
      {showSafeZones && spec.safeBand
        ? (["top-0 border-b", "bottom-0 border-t"] as const).map((position) => (
            <div
              key={position}
              aria-hidden="true"
              className={cn("pointer-events-none absolute inset-x-0 grid place-items-center border-dashed border-[#F2A516] bg-[#F2A516]/25", position)}
              style={{ height: safePercent }}
            >
              <span className="rounded bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.11em] text-brand-amber">
                Instagram covers this
              </span>
            </div>
          ))
        : null}
    </div>
  );
}

/**
 * The artwork. After each render, every [data-fit] box shrinks its text (down to 75%) until it
 * fits, and `onOverflowChange` reports text that still doesn't. `data-fit="auto"` fits the box's
 * own laid-out height (a flex body); a number is a fixed height in canvas pixels.
 */
export function StoryCanvas({
  storyRef,
  format,
  theme,
  exporting,
  fitKey,
  onOverflowChange,
  children
}: {
  storyRef: RefObject<HTMLDivElement | null>;
  format: StoryFormat;
  theme: StoryTheme;
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
      box.style.setProperty("--k", "1");
      const max = box.dataset.fit === "auto" ? box.clientHeight : Number(box.dataset.fit);
      // Too wide (a long number on one line) counts as not fitting, like too tall.
      const result = fitScale((scale) => {
        box.style.setProperty("--k", String(scale));
        return box.scrollWidth > box.clientWidth + 1 ? max + 2 : box.scrollHeight;
      }, max);
      overflow ||= result.overflow;
    });
    onOverflowChange(overflow);
  }, [storyRef, fitKey, fontsReady, onOverflowChange, format, theme]);

  const spec = CANVAS[format];
  const frame = { width: spec.width, height: spec.height, "--sm-top": `${spec.top}px`, "--sm-bottom": `${spec.bottom}px` } as CSSProperties;
  return (
    <div ref={storyRef} className={cn("sm-story", exporting && "sm-exporting")} data-format={format} data-theme={theme} style={frame}>
      {children}
    </div>
  );
}
