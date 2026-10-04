"use client";

import { useCallback } from "react";
import type { ReactionBurst } from "./use-meeting-call";

function offsetFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 8 + (hash % 30);
}

function Burst({ burst }: { burst: ReactionBurst }) {
  const animate = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.animate(
      reduce
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { transform: "translateY(0)", opacity: 0 },
            { transform: "translateY(-8px)", opacity: 1, offset: 0.1 },
            { transform: "translateY(-40vh)", opacity: 1, offset: 0.8 },
            { transform: "translateY(-50vh)", opacity: 0 }
          ],
      { duration: 3000, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
    );
  }, []);
  return (
    <div ref={animate} className="absolute bottom-24 flex flex-col items-center" style={{ left: `${offsetFor(burst.id)}%` }}>
      <span className="text-4xl" aria-hidden>
        {burst.emoji}
      </span>
      {burst.name ? (
        <span className="mt-1 rounded-sm bg-[var(--ink-2)] px-1.5 py-0.5 text-[11px] text-foreground">{burst.name}</span>
      ) : null}
    </div>
  );
}

export function ReactionsOverlay({ reactions }: { reactions: ReactionBurst[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {reactions.map((burst) => (
        <Burst key={burst.id} burst={burst} />
      ))}
    </div>
  );
}
