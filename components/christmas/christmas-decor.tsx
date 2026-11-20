import { useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { BowSprite, CabinSprite, SnowmanSprite } from "./scene-sprites";
import { GiftSprite, TreeSprite, TreeStarSprite } from "./sprites";

/** Bulbs on the garland under the top bar (every other one hides on phones, christmas.css). */
const BULB_COUNT = 40;
const BULB_COLORS = ["red", "green", "blue", "gold", "white"] as const;
/** Where the bows sit along the garland (share of the width); the middle one starts the light show. */
const BOWS = [0.1, 0.36, 0.64, 0.9] as const;
const SHOW_BOW = 2;
const FLAKE_COUNT = 45;
const STAR_COUNT = 40;
/** Presents caught before the first one shows up under the tree, and how many more per present. */
export const GIFT_PILE_AT = 10;
const GIFTS_PER_PILED = 10;
const MAX_PILED = 7;

/** The scene's trees: [left as a share of the width, height in px, in front (on the near hill)]. */
const TREES: readonly (readonly [number, number, boolean])[] = [
  [0.21, 120, false],
  [0.27, 86, true],
  [0.52, 104, false],
  [0.6, 74, true],
  [0.83, 132, false],
  [0.9, 92, true],
  [0.96, 70, false]
];

type Flake = { left: number; size: number; duration: number; delay: number; drift: number; opacity: number };
type Star = { left: number; top: number; size: number; delay: number };

function makeFlakes(): Flake[] {
  return Array.from({ length: FLAKE_COUNT }, () => ({
    left: Math.random() * 100,
    size: 2 + Math.random() * 4,
    duration: 16 + Math.random() * 16,
    delay: -Math.random() * 20,
    drift: -30 + Math.random() * 60,
    opacity: 0.25 + Math.random() * 0.4
  }));
}

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 55,
    size: 1 + Math.random() * 2,
    delay: -Math.random() * 4
  }));
}

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/** A pine garland along the bottom of the top bar, hung with lights and red bows. */
function Garland({ show, onLightShow }: { show: boolean; onLightShow: (at: DOMRect) => void }) {
  const lightShow = (event: MouseEvent<HTMLButtonElement>) => {
    if (!event.nativeEvent.isTrusted) return;
    onLightShow(event.currentTarget.getBoundingClientRect());
  };
  return (
    <div className="xm-garland" data-show={show}>
      <div className="xm-garland-rope" aria-hidden />
      <div className="xm-lights" aria-hidden>
        {Array.from({ length: BULB_COUNT }, (_, index) => (
          <span key={index} className="xm-light" style={vars({ "--xm-i": String(index) })}>
            <span className={`xm-bulb xm-bulb-${BULB_COLORS[index % BULB_COLORS.length]}`} />
          </span>
        ))}
      </div>
      {BOWS.map((share, index) =>
        index === SHOW_BOW ? (
          <button
            key={share}
            type="button"
            className="xm-bow xm-hit"
            style={{ left: `${share * 100}%` }}
            onClick={lightShow}
            aria-label="Start the light show"
          >
            <BowSprite />
          </button>
        ) : (
          <span key={share} className="xm-bow" style={{ left: `${share * 100}%` }} aria-hidden>
            <BowSprite />
          </span>
        )
      )}
    </div>
  );
}

function Snowfall() {
  const [flakes] = useState(makeFlakes);
  return (
    <div className="xm-snow">
      {flakes.map((flake, index) => (
        <span
          key={index}
          className="xm-flake"
          style={{
            left: `${flake.left}%`,
            width: flake.size,
            height: flake.size,
            opacity: flake.opacity,
            ...vars({ "--xm-duration": `${flake.duration}s`, "--xm-delay": `${flake.delay}s`, "--xm-drift": `${flake.drift}px` })
          }}
        />
      ))}
    </div>
  );
}

function Sky() {
  const [stars] = useState(makeStars);
  return (
    <div className="xm-sky">
      <span className="xm-moon" />
      {stars.map((star, index) => (
        <span
          key={index}
          className="xm-sky-star"
          style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, ...vars({ "--xm-delay": `${star.delay}s` }) }}
        />
      ))}
    </div>
  );
}

/** Snowy hills along the bottom with trees, a snowman, a lit cabin and the caught presents. */
function Scene({ gifts, show }: { gifts: number; show: boolean }) {
  const piled = gifts < GIFT_PILE_AT ? 0 : Math.min(MAX_PILED, 1 + Math.floor((gifts - GIFT_PILE_AT) / GIFTS_PER_PILED));
  return (
    <div className="xm-scene" data-show={show}>
      <svg className="xm-hill-back" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M0 70 Q150 20 320 60 T640 50 T960 40 T1200 60 V120 H0 Z" />
      </svg>
      {TREES.filter(([, , front]) => !front).map(([left, height]) => (
        <span key={left} className="xm-scene-tree" style={{ left: `${left * 100}%`, height, bottom: 34 }}>
          <TreeSprite />
          <span className="xm-tree-star">
            <TreeStarSprite />
          </span>
        </span>
      ))}
      <span className="xm-cabin" style={{ left: "68%" }}>
        <CabinSprite />
      </span>
      <svg className="xm-hill-front" viewBox="0 0 1200 60" preserveAspectRatio="none">
        <path d="M0 30 Q120 8 260 26 T560 22 T880 28 T1200 18 V60 H0 Z" />
      </svg>
      {TREES.filter(([, , front]) => front).map(([left, height]) => (
        <span key={left} className="xm-scene-tree" style={{ left: `${left * 100}%`, height, bottom: 6 }}>
          <TreeSprite />
          <span className="xm-tree-star">
            <TreeStarSprite />
          </span>
        </span>
      ))}
      <span className="xm-snowman" style={{ left: "42%" }}>
        <SnowmanSprite />
      </span>
      <div className="xm-pile" style={{ left: "31%" }}>
        {Array.from({ length: piled }, (_, index) => (
          <span key={index} className="xm-piled" style={vars({ "--xm-i": String(index) })}>
            <GiftSprite variant={index} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Behind the content (portaled to <body>, under every card): the night sky, falling snow and the
 * winter scene. In front, only the garland along the bottom of the top bar.
 */
export function ChristmasDecor({
  snow,
  gifts,
  show,
  onLightShow
}: {
  snow: boolean;
  gifts: number;
  show: boolean;
  onLightShow: (at: DOMRect) => void;
}) {
  return (
    <>
      {createPortal(
        <div className="xm-backdrop" aria-hidden>
          <Sky />
          {snow ? <Snowfall /> : null}
          <Scene gifts={gifts} show={show} />
        </div>,
        document.body
      )}
      <Garland show={show} onLightShow={onLightShow} />
    </>
  );
}
