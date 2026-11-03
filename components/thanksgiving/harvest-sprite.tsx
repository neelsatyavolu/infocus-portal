import type { CSSProperties, MouseEvent } from "react";
import {
  CornSprite,
  CranberrySprite,
  LeafSprite,
  PieSprite,
  PotatoSprite,
  RoastSprite,
  RollsSprite,
  TurkeySprite,
  WishboneSprite
} from "./sprites";

type Side = "left" | "right";

/** A strutting turkey walks to the far edge, then walks off free (pardoned) or burns where it stands. */
export type StrutPhase = "walk" | "free" | "burnt";

export type Sprite =
  | { id: number; kind: "leaf"; left: number; duration: number; sway: number; variant: number }
  | { id: number; kind: "gust"; top: number; duration: number; variant: number; r: number }
  | { id: number; kind: "pie"; side: Side; top: number; gone: boolean }
  | { id: number; kind: "pierain"; left: number; duration: number; r: number }
  | { id: number; kind: "strut"; rtl: boolean; duration: number; clicks: number; pardoned: boolean; phase: StrutPhase }
  | { id: number; kind: "wishbone"; left: number; duration: number; sway: number }
  | { id: number; kind: "feast"; lasts: number }
  | { id: number; kind: "nap"; lasts: number }
  | { id: number; kind: "drip"; left: number; width: number; length: number; delay: number; lasts: number }
  | { id: number; kind: "burst"; x: number; y: number; dx: number; dy: number; r: number; duration: number; variant: number }
  | { id: number; kind: "plus"; x: number; y: number; text: string };

const DISHES = [CornSprite, CranberrySprite, RoastSprite, PotatoSprite, RollsSprite];

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
          data-clicked={sprite.clicks > 0}
          data-pardoned={sprite.pardoned}
          data-phase={sprite.phase}
          style={vars({ "--tg-duration": `${sprite.duration}s` })}
          onClick={hit}
          aria-label={sprite.phase === "burnt" ? "A burnt turkey" : sprite.pardoned ? "A pardoned turkey" : "Say hi to the turkey"}
        >
          <span key={sprite.clicks} className="tg-hop">
            <TurkeySprite />
          </span>
          {sprite.pardoned ? <span className="tg-medal" aria-hidden /> : null}
          {sprite.phase === "burnt" ? (
            <span className="tg-fire" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </button>
      );
    case "wishbone":
      return (
        <div
          className="tg-leaf tg-wishbone"
          style={{ left: sprite.left, ...vars({ "--tg-duration": `${sprite.duration}s`, "--tg-sway": `${sprite.sway}px` }) }}
        >
          <button type="button" className="tg-hit" onClick={hit} aria-label="Pull the wishbone">
            <WishboneSprite />
          </button>
        </div>
      );
    case "feast":
      return (
        <div className="tg-feast" style={vars({ "--tg-lasts": `${sprite.lasts}ms` })}>
          {DISHES.map((Dish, i) => (
            <Dish key={i} />
          ))}
        </div>
      );
    case "nap":
      return (
        <div className="tg-nap" style={vars({ "--tg-lasts": `${sprite.lasts}ms` })}>
          {["z", "z", "Z"].map((letter, i) => (
            <span key={i} className="tg-z" style={vars({ "--tg-i": String(i) })}>
              {letter}
            </span>
          ))}
        </div>
      );
    case "drip":
      return (
        <div
          className="tg-drip"
          style={{
            left: sprite.left,
            width: sprite.width,
            ...vars({ "--tg-length": `${sprite.length}px`, "--tg-delay": `${sprite.delay}ms`, "--tg-lasts": `${sprite.lasts}ms` })
          }}
        />
      );
    case "burst":
      return (
        <div
          className="tg-burst"
          style={{
            left: sprite.x,
            top: sprite.y,
            ...vars({ "--tg-dx": `${sprite.dx}px`, "--tg-dy": `${sprite.dy}px`, "--tg-r": `${sprite.r}deg`, "--tg-duration": `${sprite.duration}s` })
          }}
        >
          <LeafSprite variant={sprite.variant} />
        </div>
      );
    case "plus":
      return (
        <div className="tg-plus-one" style={{ left: sprite.x, top: sprite.y }}>
          {sprite.text}
        </div>
      );
  }
}
