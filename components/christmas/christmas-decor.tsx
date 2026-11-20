import { useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { BowSprite } from "./scene-sprites";

/** Bulbs on the garland under the top bar (every other one hides on phones, christmas.css). */
const BULB_COUNT = 40;
const BULB_COLORS = ["red", "green", "blue", "gold", "white"] as const;
/** Where the bows sit along the garland (share of the width); the middle one starts the light show. */
const BOWS = [0.1, 0.36, 0.64, 0.9] as const;
const SHOW_BOW = 2;
const FLAKE_COUNT = 45;
const STAR_COUNT = 40;

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

/**
 * Behind the content (portaled to <body>, under every card): the night sky and falling snow. In
 * front, only the garland along the bottom of the top bar. The village is the page's footer
 * (christmas-village.tsx).
 */
export function ChristmasDecor({
  snow,
  show,
  onLightShow
}: {
  snow: boolean;
  show: boolean;
  onLightShow: (at: DOMRect) => void;
}) {
  return (
    <>
      {createPortal(
        <div className="xm-backdrop" aria-hidden>
          <Sky />
          {snow ? <Snowfall /> : null}
        </div>,
        document.body
      )}
      <Garland show={show} onLightShow={onLightShow} />
    </>
  );
}
