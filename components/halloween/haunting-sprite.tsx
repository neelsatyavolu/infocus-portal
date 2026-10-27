import type { CSSProperties, MouseEvent } from "react";
import {
  BatSprite,
  CandySprite,
  CatSprite,
  EyesSprite,
  GhostSprite,
  HandSprite,
  PumpkinSprite,
  SpiderSprite,
  SplatSprite,
  WitchSprite
} from "./sprites";

type Side = "left" | "right";

export type Sprite =
  | { id: number; kind: "pumpkin"; side: Side; top: number; face: number }
  | { id: number; kind: "splat"; side: Side; top: number }
  | { id: number; kind: "plus"; x: number; y: number; text: string }
  | { id: number; kind: "bat"; top: number; rtl: boolean; duration: number }
  | { id: number; kind: "ghost"; left: number; gone: boolean }
  | { id: number; kind: "spider"; left: number; drop: number; gone: boolean }
  | { id: number; kind: "burst"; x: number; y: number; r: number }
  | { id: number; kind: "rain"; left: number; duration: number; r: number; face: number }
  | { id: number; kind: "cat"; rtl: boolean; duration: number; gone: boolean }
  | { id: number; kind: "witch"; top: number; rtl: boolean; duration: number; gone: boolean }
  | { id: number; kind: "eyes"; side: Side; top: number; gone: boolean }
  | { id: number; kind: "hand"; left: number; gone: boolean }
  | { id: number; kind: "candy"; left: number; duration: number; sway: number; variant: number };

/** Called with the sprite and where it was on screen when someone clicked it. */
export type SpriteHit = (sprite: Sprite, at: DOMRect) => void;

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/** One visitor on the Halloween layer. Clickable ones are buttons; the rest ignore the pointer. */
export function HauntingSprite({ sprite, onHit }: { sprite: Sprite; onHit: SpriteHit }) {
  const hit = (event: MouseEvent<HTMLElement>) => onHit(sprite, event.currentTarget.getBoundingClientRect());

  switch (sprite.kind) {
    case "pumpkin":
      return (
        <button
          type="button"
          className="hw-pumpkin hw-hit"
          data-side={sprite.side}
          style={{ top: sprite.top }}
          onClick={hit}
          aria-label="Smash the pumpkin"
        >
          <PumpkinSprite face={sprite.face} />
        </button>
      );
    case "splat":
      return (
        <div className="hw-splat" style={{ top: sprite.top, [sprite.side]: 0 }}>
          <SplatSprite />
        </div>
      );
    case "plus":
      return (
        <div className="hw-plus-one" style={{ left: sprite.x, top: sprite.y }}>
          {sprite.text}
        </div>
      );
    case "bat":
      return (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="hw-bat hw-hit"
          data-direction={sprite.rtl ? "rtl" : "ltr"}
          style={{ top: sprite.top, ...vars({ "--hw-duration": `${sprite.duration}s` }) }}
          onClick={hit}
        >
          <BatSprite />
        </button>
      );
    case "ghost":
      return (
        <button
          type="button"
          className="hw-ghost hw-hit"
          data-gone={sprite.gone}
          style={{ left: sprite.left }}
          onClick={hit}
          aria-label="Shoo the ghost"
        >
          <GhostSprite />
        </button>
      );
    case "spider":
      return (
        <div className="hw-spider" data-gone={sprite.gone} style={{ left: sprite.left, ...vars({ "--hw-drop": `${sprite.drop}px` }) }}>
          <button type="button" className="hw-hit" onClick={hit} aria-label="Shoo the spider">
            <SpiderSprite />
          </button>
        </div>
      );
    case "burst":
      return (
        <div className="hw-burst" style={vars({ "--hw-x": `${sprite.x}px`, "--hw-y": `${sprite.y}px`, "--hw-r": `${sprite.r}deg` })}>
          <GhostSprite />
        </div>
      );
    case "rain":
      return (
        <div className="hw-rain" style={{ left: sprite.left, ...vars({ "--hw-duration": `${sprite.duration}s`, "--hw-r": `${sprite.r}deg` }) }}>
          <PumpkinSprite face={sprite.face} />
        </div>
      );
    case "cat":
      return (
        <button
          type="button"
          className="hw-cat hw-hit"
          data-direction={sprite.rtl ? "rtl" : "ltr"}
          data-gone={sprite.gone}
          style={vars({ "--hw-duration": `${sprite.duration}s` })}
          onClick={hit}
          aria-label="Pet the cat"
        >
          <CatSprite />
        </button>
      );
    case "witch":
      return (
        <button
          type="button"
          className="hw-witch hw-hit"
          data-direction={sprite.rtl ? "rtl" : "ltr"}
          data-gone={sprite.gone}
          style={{ top: sprite.top, ...vars({ "--hw-duration": `${sprite.duration}s` }) }}
          onClick={hit}
          aria-label="Wave at the witch"
        >
          <WitchSprite />
        </button>
      );
    case "eyes":
      return (
        <button
          type="button"
          className="hw-eyes hw-hit"
          data-gone={sprite.gone}
          style={{ top: sprite.top, [sprite.side]: 14 }}
          onClick={hit}
          aria-label="Stare back"
        >
          <EyesSprite />
        </button>
      );
    case "hand":
      return (
        <button
          type="button"
          className="hw-hand hw-hit"
          data-gone={sprite.gone}
          style={{ left: sprite.left }}
          onClick={hit}
          aria-label="Shake the skeleton's hand"
        >
          <HandSprite />
        </button>
      );
    case "candy":
      return (
        <div
          className="hw-candy"
          style={{ left: sprite.left, ...vars({ "--hw-duration": `${sprite.duration}s`, "--hw-sway": `${sprite.sway}px` }) }}
        >
          <button type="button" className="hw-hit" onClick={hit} aria-label="Catch the candy">
            <CandySprite variant={sprite.variant} />
          </button>
        </div>
      );
  }
}
