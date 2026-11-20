import type { CSSProperties, MouseEvent } from "react";
import {
  BellSprite,
  CocoaSprite,
  GiftSprite,
  GingerbreadSprite,
  OrnamentSprite,
  SleighSprite,
  SnowflakeSprite,
  StarSprite
} from "./sprites";

type Side = "left" | "right";

export type Sprite =
  | { id: number; kind: "gift"; left: number; duration: number; sway: number; variant: number; golden?: boolean }
  | { id: number; kind: "giftrain"; left: number; duration: number; r: number; variant: number }
  | { id: number; kind: "bell"; left: number; duration: number; r: number }
  | { id: number; kind: "gingerbread"; rtl: boolean; duration: number; caught: boolean }
  | { id: number; kind: "cocoa"; side: Side; top: number; gone: boolean }
  | { id: number; kind: "sleigh"; rtl: boolean; top: number; duration: number; greeted: boolean }
  | { id: number; kind: "star"; top: number; duration: number }
  | { id: number; kind: "flurry"; top: number; duration: number; size: number; r: number }
  | { id: number; kind: "burst"; x: number; y: number; dx: number; dy: number; r: number; duration: number; variant: number }
  | { id: number; kind: "fog"; lasts: number }
  | { id: number; kind: "rudolph"; duration: number }
  | { id: number; kind: "plus"; x: number; y: number; text: string };

/** Called with the sprite and where it was on screen when someone clicked it. */
export type SpriteHit = (sprite: Sprite, at: DOMRect) => void;

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/** One visitor on the Christmas layer. Clickable ones are buttons; the rest ignore the pointer. */
export function ChristmasSprite({ sprite, onHit }: { sprite: Sprite; onHit: SpriteHit }) {
  // Only a real click or key press counts: a script calling .click() makes an untrusted event.
  const hit = (event: MouseEvent<HTMLElement>) => {
    if (!event.nativeEvent.isTrusted) return;
    onHit(sprite, event.currentTarget.getBoundingClientRect());
  };

  switch (sprite.kind) {
    case "gift":
      return (
        <div
          className={sprite.golden ? "xm-gift xm-gift-golden" : "xm-gift"}
          style={{ left: sprite.left, ...vars({ "--xm-duration": `${sprite.duration}s`, "--xm-sway": `${sprite.sway}px` }) }}
        >
          <button type="button" className="xm-hit" onClick={hit} aria-label={sprite.golden ? "Catch the golden present" : "Catch the present"}>
            <span className="xm-chute" />
            <GiftSprite variant={sprite.variant} golden={sprite.golden} />
          </button>
        </div>
      );
    case "giftrain":
      return (
        <div className="xm-rain" style={{ left: sprite.left, ...vars({ "--xm-duration": `${sprite.duration}s`, "--xm-r": `${sprite.r}deg` }) }}>
          <GiftSprite variant={sprite.variant} />
        </div>
      );
    case "bell":
      return (
        <div className="xm-rain xm-rain-bell" style={{ left: sprite.left, ...vars({ "--xm-duration": `${sprite.duration}s`, "--xm-r": `${sprite.r}deg` }) }}>
          <BellSprite />
        </div>
      );
    case "gingerbread":
      return (
        <div
          className="xm-runner"
          data-direction={sprite.rtl ? "rtl" : "ltr"}
          data-caught={sprite.caught}
          style={vars({ "--xm-duration": `${sprite.duration}s` })}
        >
          <button type="button" className="xm-hit xm-runner-body" onClick={hit} aria-label="Catch the gingerbread man">
            <GingerbreadSprite />
          </button>
        </div>
      );
    case "cocoa":
      return (
        <button
          type="button"
          className="xm-cocoa xm-hit"
          data-side={sprite.side}
          data-gone={sprite.gone}
          style={{ top: sprite.top }}
          onClick={hit}
          aria-label="Sip the cocoa"
        >
          <CocoaSprite />
        </button>
      );
    case "sleigh":
      return (
        <div
          className="xm-sleigh"
          data-direction={sprite.rtl ? "rtl" : "ltr"}
          style={{ top: sprite.top, ...vars({ "--xm-duration": `${sprite.duration}s` }) }}
        >
          <button type="button" className="xm-hit xm-sleigh-body" onClick={hit} aria-label="Wave at Santa">
            <SleighSprite />
          </button>
        </div>
      );
    case "star":
      return (
        <div className="xm-star" style={{ top: sprite.top, ...vars({ "--xm-duration": `${sprite.duration}s` }) }}>
          <button type="button" className="xm-hit" onClick={hit} aria-label="Wish on the shooting star">
            <StarSprite />
          </button>
        </div>
      );
    case "flurry":
      return (
        <div
          className="xm-flurry"
          style={{ top: sprite.top, width: sprite.size, height: sprite.size, ...vars({ "--xm-duration": `${sprite.duration}s`, "--xm-r": `${sprite.r}deg` }) }}
        >
          <SnowflakeSprite />
        </div>
      );
    case "burst":
      return (
        <div
          className="xm-burst"
          style={{
            left: sprite.x,
            top: sprite.y,
            ...vars({
              "--xm-dx": `${sprite.dx}px`,
              "--xm-dy": `${sprite.dy}px`,
              "--xm-r": `${sprite.r}deg`,
              "--xm-duration": `${sprite.duration}s`
            })
          }}
        >
          <OrnamentSprite variant={sprite.variant} />
        </div>
      );
    case "fog":
      return <div className="xm-fog" style={vars({ "--xm-lasts": `${sprite.lasts}ms` })} />;
    case "rudolph":
      return (
        <div className="xm-rudolph" style={vars({ "--xm-duration": `${sprite.duration}s` })}>
          <SleighSprite />
        </div>
      );
    case "plus":
      return (
        <span className="xm-plus-one" style={{ left: sprite.x, top: sprite.y }}>
          {sprite.text}
        </span>
      );
  }
}
