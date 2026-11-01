import type { MouseEvent } from "react";
import { LeafSprite } from "./sprites";

/** Where each leaf sits in the 84×40 pile: [left, top, rotation in degrees, color]. */
const PILE: readonly (readonly [number, number, number, number])[] = [
  [0, 14, -30, 1],
  [14, 6, 20, 0],
  [28, 0, -10, 2],
  [42, 4, 40, 3],
  [56, 12, -20, 4],
  [8, 18, 60, 2],
  [24, 14, -50, 3],
  [40, 16, 10, 1],
  [54, 18, 80, 0]
];

/** The pile of everything a browser has caught (LEAF_PILE_AT leaves and up). Clicking it jumps in. */
export function LeafPile({ onJump }: { onJump: (at: DOMRect) => void }) {
  return (
    <button
      type="button"
      className="tg-pile tg-hit"
      onClick={(event: MouseEvent<HTMLButtonElement>) => onJump(event.currentTarget.getBoundingClientRect())}
      aria-label="Jump in the leaf pile"
    >
      {PILE.map(([left, top, rotate, variant], i) => (
        <span key={i} style={{ left, top, rotate: `${rotate}deg` }}>
          <LeafSprite variant={variant} />
        </span>
      ))}
    </button>
  );
}
