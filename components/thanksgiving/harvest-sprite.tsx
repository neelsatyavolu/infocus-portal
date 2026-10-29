import type { CSSProperties, MouseEvent } from "react";
import { LeafSprite, PieSprite, TurkeySprite } from "./sprites";

type Side = "left" | "right";

export type Sprite =
  | { id: number; kind: "leaf"; left: number; duration: number; sway: number; variant: number }
  | { id: number; kind: "gust"; top: number; duration: number; variant: number; r: number }
  | { id: number; kind: "pie"; side: Side; top: number; gone: boolean }
  | { id: number; kind: "pierain"; left: number; duration: number; r: number }
  | { id: number; kind: "strut"; rtl: boolean; duration: number; gone: boolean }
  | { id: number; kind: "plus"; x: number; y: number; text: string };

/** Called with the sprite and where it was on screen when someone clicked it. */
export type SpriteHit = (sprite: Sprite, at: DOMRect) => void;

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/** One visitor on the Thanksgiving layer. Clickable ones are buttons; the rest ignore the pointer. */
export function HarvestSprite({ sprite, onHit }: { sprite: Sprite; onHit: SpriteHit }) {
  const hit = (event: MouseEvent<HTMLElement>) => onHit(sprite, event.currentTarget.getBoundingClientRect());

  switch (sprite.kind) {
    case "leaf":
      return (
        <div
          className="tg-leaf"
          style={{ left: sprite.left, ...vars({ "--tg-duration": `${sprite.duration}s`, "--tg-sway": `${sprite.sway}px` }) }}
        >
          <button type="button" className="tg-hit" onClick={hit} aria-label="Catch the leaf">
            <LeafSprite variant={sprite.variant} />
          </button>
        </div>
      );
    case "gust":
      return (
        <div className="tg-gust" style={{ top: sprite.top, ...vars({ "--tg-duration": `${sprite.duration}s`, "--tg-r": `${sprite.r}deg` }) }}>
          <LeafSprite variant={sprite.variant} />
        </div>
      );
    case "pie":
      return (
        <button
          type="button"
          className="tg-pie tg-hit"
          data-side={sprite.side}
          data-gone={sprite.gone}
          style={{ top: sprite.top }}
          onClick={hit}
          aria-label="Eat the pie"
        >
          <PieSprite />
        </button>
      );
    case "pierain":
      return (
        <div className="tg-pierain" style={{ left: sprite.left, ...vars({ "--tg-duration": `${sprite.duration}s`, "--tg-r": `${sprite.r}deg` }) }}>
          <PieSprite />
        </div>
      );
    case "strut":
      return (
        <button
          type="button"
          className="tg-strut tg-hit"
          data-direction={sprite.rtl ? "rtl" : "ltr"}
          data-gone={sprite.gone}
          style={vars({ "--tg-duration": `${sprite.duration}s` })}
          onClick={hit}
          aria-label="Say hi to the turkey"
        >
          <TurkeySprite />
        </button>
      );
    case "plus":
      return (
        <div className="tg-plus-one" style={{ left: sprite.x, top: sprite.y }}>
          {sprite.text}
        </div>
      );
  }
}
