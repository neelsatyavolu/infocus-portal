import { useState, type CSSProperties, type MouseEvent } from "react";
import { GiftSprite, HollySprite, TreeSprite, TreeStarSprite } from "./sprites";

/** Bulbs on the string along the top (every other one hides on phones, christmas.css). */
const BULB_COUNT = 36;
const BULB_COLORS = ["red", "green", "blue", "gold", "white"] as const;
const FLAKE_COUNT = 56;
/** Presents caught before the first one shows up under the tree, and how many more per present. */
export const GIFT_PILE_AT = 10;
const GIFTS_PER_PILED = 10;
const MAX_PILED = 7;

type Flake = { left: number; size: number; duration: number; delay: number; drift: number; opacity: number };

function makeFlakes(): Flake[] {
  return Array.from({ length: FLAKE_COUNT }, () => ({
    left: Math.random() * 100,
    size: 2 + Math.random() * 5,
    duration: 9 + Math.random() * 14,
    delay: -Math.random() * 20,
    drift: -30 + Math.random() * 60,
    opacity: 0.45 + Math.random() * 0.5
  }));
}

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/** The string of lights hanging along the top of the window. `show` runs the light show. */
function Lights({ show }: { show: boolean }) {
  return (
    <div className="xm-lights" data-show={show} aria-hidden>
      {Array.from({ length: BULB_COUNT }, (_, index) => (
        <span key={index} className="xm-light" style={vars({ "--xm-i": String(index) })}>
          <span className={`xm-bulb xm-bulb-${BULB_COLORS[index % BULB_COLORS.length]}`} />
        </span>
      ))}
      <span className="xm-holly xm-holly-left">
        <HollySprite />
      </span>
      <span className="xm-holly xm-holly-right">
        <HollySprite />
      </span>
    </div>
  );
}

function Snowfall() {
  const [flakes] = useState(makeFlakes);
  return (
    <div className="xm-snow" aria-hidden>
      {flakes.map((flake, index) => (
        <span
          key={index}
          className="xm-flake"
          style={{
            left: `${flake.left}%`,
            width: flake.size,
            height: flake.size,
            opacity: flake.opacity,
            ...vars({
              "--xm-duration": `${flake.duration}s`,
              "--xm-delay": `${flake.delay}s`,
              "--xm-drift": `${flake.drift}px`
            })
          }}
        />
      ))}
    </div>
  );
}

/**
 * The snowy hill along the bottom with a tree in each corner (desktop only). Caught presents pile
 * up under the left tree, and the star on the right tree is a button that starts a light show.
 */
function Hill({ gifts, onStar }: { gifts: number; onStar: (at: DOMRect) => void }) {
  const piled = gifts < GIFT_PILE_AT ? 0 : Math.min(MAX_PILED, 1 + Math.floor((gifts - GIFT_PILE_AT) / GIFTS_PER_PILED));
  const star = (event: MouseEvent<HTMLButtonElement>) => {
    if (!event.nativeEvent.isTrusted) return;
    onStar(event.currentTarget.getBoundingClientRect());
  };
  return (
    <div className="xm-hill">
      <svg className="xm-drift" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 24 Q100 6 220 20 T460 18 T720 22 T980 14 T1200 22 V40 H0 Z" />
      </svg>
      <div className="xm-tree xm-tree-left" aria-hidden>
        <TreeSprite />
        <span className="xm-tree-star">
          <TreeStarSprite />
        </span>
        <div className="xm-pile">
          {Array.from({ length: piled }, (_, index) => (
            <span key={index} className="xm-piled" style={vars({ "--xm-i": String(index) })}>
              <GiftSprite variant={index} />
            </span>
          ))}
        </div>
      </div>
      <div className="xm-tree xm-tree-right">
        <TreeSprite />
        <button type="button" className="xm-tree-star xm-hit" onClick={star} aria-label="Light up the tree">
          <TreeStarSprite />
        </button>
      </div>
    </div>
  );
}

/** Everything that stays up while Christmas is on: lights, snow (unless turned off) and the hill. */
export function ChristmasDecor({ snow, gifts, show, onStar }: { snow: boolean; gifts: number; show: boolean; onStar: (at: DOMRect) => void }) {
  return (
    <div className="xm-decor">
      {snow ? <Snowfall /> : null}
      <Lights show={show} />
      <Hill gifts={gifts} onStar={onStar} />
    </div>
  );
}
