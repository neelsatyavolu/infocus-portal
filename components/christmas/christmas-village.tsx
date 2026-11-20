"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CHRISTMAS_LIGHT_SHOW_EVENT } from "@/src/lib/christmas";
import { useChristmasPrefs } from "@/src/lib/use-christmas";
import { CabinSprite, SnowmanSprite } from "./scene-sprites";
import { GiftSprite, TreeSprite, TreeStarSprite } from "./sprites";
import "./christmas.css";

/** Presents caught before the first one shows up in the village, and how many more per present. */
export const GIFT_PILE_AT = 10;
const GIFTS_PER_PILED = 10;
const MAX_PILED = 7;

/** The village's trees: [left as a share of the width, height in px, on the near hill]. */
const TREES: readonly (readonly [number, number, boolean])[] = [
  [0.05, 120, false],
  [0.13, 86, true],
  [0.42, 104, false],
  [0.52, 74, true],
  [0.8, 132, false],
  [0.88, 92, true],
  [0.96, 70, false]
];

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

function Tree({ left, height, bottom }: { left: number; height: number; bottom: number }) {
  return (
    <span className="xm-scene-tree" style={{ left: `${left * 100}%`, height, bottom }}>
      <TreeSprite />
      <span className="xm-tree-star">
        <TreeStarSprite />
      </span>
    </span>
  );
}

/**
 * Snowy hills, decorated trees, a snowman, a lit cabin and the presents this browser caught,
 * pinned to the bottom of the window behind the content (always in view, never over a card).
 * components/app-shell.tsx renders it after <main>, with a spacer so the end of every page scrolls
 * clear of it. The tree lights join the garland's light show.
 */
export function ChristmasVillage() {
  const { gifts } = useChristmasPrefs();
  const [show, setShow] = useState(false);
  const piled = gifts < GIFT_PILE_AT ? 0 : Math.min(MAX_PILED, 1 + Math.floor((gifts - GIFT_PILE_AT) / GIFTS_PER_PILED));

  useEffect(() => {
    const onShow = (event: Event) => setShow((event as CustomEvent<boolean>).detail === true);
    window.addEventListener(CHRISTMAS_LIGHT_SHOW_EVENT, onShow);
    return () => window.removeEventListener(CHRISTMAS_LIGHT_SHOW_EVENT, onShow);
  }, []);

  return (
    <>
      {/* Room at the end of the page, so the last card scrolls clear of the village. */}
      <div className="xm-scene-spacer" aria-hidden />
      <div className="xm-scene" data-show={show} aria-hidden>
        <svg className="xm-hill-back" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0 70 Q150 20 320 60 T640 50 T960 40 T1200 60 V120 H0 Z" />
        </svg>
        {TREES.filter(([, , front]) => !front).map(([left, height]) => (
          <Tree key={left} left={left} height={height} bottom={34} />
        ))}
        <span className="xm-cabin" style={{ left: "66%" }}>
          <CabinSprite />
        </span>
        <svg className="xm-hill-front" viewBox="0 0 1200 60" preserveAspectRatio="none">
          <path d="M0 30 Q120 8 260 26 T560 22 T880 28 T1200 18 V60 H0 Z" />
        </svg>
        {TREES.filter(([, , front]) => front).map(([left, height]) => (
          <Tree key={left} left={left} height={height} bottom={6} />
        ))}
        <span className="xm-snowman" style={{ left: "30%" }}>
          <SnowmanSprite />
        </span>
        <div className="xm-pile" style={{ left: "17%" }}>
          {Array.from({ length: piled }, (_, index) => (
            <span key={index} className="xm-piled" style={vars({ "--xm-i": String(index) })}>
              <GiftSprite variant={index} />
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
