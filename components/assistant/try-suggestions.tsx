"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { TRY_PAGE_SIZE, TRY_ROTATE_MS } from "@/components/assistant/assistant-stream";
import { SectionLabel } from "@/components/kit/section";
import { cn } from "@/src/lib/utils";

const FADE_MS = 180;

/**
 * Three suggested questions that rotate every few seconds. Rotation pauses while the pointer is
 * over them, while one has focus, and from the moment a finger touches one, so a tap never
 * lands on a question that just changed. Off with reduced motion or when there are only three.
 * The list keeps the height of the tallest set shown so far, so a set with a two-line question
 * doesn't push the welcome text up and down on every turn.
 */
export function TrySuggestions({
  starters,
  onPick,
  touch
}: {
  starters: readonly string[];
  onPick: (starter: string) => void;
  touch: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [opaque, setOpaque] = useState(true);
  // Tallest list height seen at this size (touch and desktop rows differ, so it resets).
  const [reserve, setReserve] = useState({ touch, height: 0 });
  const listRef = useRef<HTMLUListElement>(null);
  const pausedRef = useRef(false);

  if (reserve.touch !== touch) {
    setReserve({ touch, height: 0 });
  }

  useLayoutEffect(() => {
    const height = listRef.current?.offsetHeight ?? 0;
    if (height > reserve.height) {
      setReserve({ touch, height });
    }
  }, [offset, touch, reserve.height]);

  useEffect(() => {
    if (starters.length <= TRY_PAGE_SIZE || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let fadeTimer: number | undefined;
    const interval = window.setInterval(() => {
      if (pausedRef.current) {
        return;
      }
      setOpaque(false);
      fadeTimer = window.setTimeout(() => {
        // Paused mid-fade (a finger came down): keep the questions that are on screen.
        if (!pausedRef.current) {
          setOffset((current) => (current + TRY_PAGE_SIZE) % starters.length);
        }
        setOpaque(true);
      }, FADE_MS);
    }, TRY_ROTATE_MS);
    return () => {
      window.clearInterval(interval);
      if (fadeTimer !== undefined) {
        window.clearTimeout(fadeTimer);
      }
    };
  }, [starters]);

  const examples = Array.from({ length: Math.min(TRY_PAGE_SIZE, starters.length) }, (_, index) => {
    return starters[(offset + index) % starters.length];
  });

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <div
      className="space-y-2"
      onPointerEnter={pause}
      onPointerLeave={resume}
      onPointerDown={pause}
      onPointerCancel={resume}
    >
      <SectionLabel>Try</SectionLabel>
      <ul
        ref={listRef}
        style={reserve.height > 0 ? { minHeight: reserve.height } : undefined}
        className={cn("space-y-2 transition-opacity duration-200", opaque ? "opacity-100" : "opacity-0")}
      >
        {examples.map((starter) => (
          <li key={starter}>
            <button
              type="button"
              onClick={() => onPick(starter)}
              onFocus={pause}
              onBlur={resume}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                touch ? "min-h-11" : "min-h-9"
              )}
            >
              <span className="min-w-0 flex-1">{starter}</span>
              <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
