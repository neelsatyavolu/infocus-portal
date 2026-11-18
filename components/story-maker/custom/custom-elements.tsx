/* eslint-disable @next/next/no-img-element -- artwork is exported to PNG from the DOM; next/image would not embed. */
import type { CSSProperties } from "react";
import { PLATE_FILLS, TEXT_COLORS, TEXT_STYLES, WIDTH_ONLY, textPx, type CustomElement } from "@/src/lib/story-custom";
import { FollowPanel, Footer, Header, Photo, STORY_ICON_SRC, Wordmark } from "../story-parts";

/** Where a piece sits. Auto-height pieces (text, header, footer, follow) only fix their width. */
export function elementBox(el: CustomElement): CSSProperties {
  return {
    left: el.x,
    top: el.y,
    width: el.w,
    height: WIDTH_ONLY.has(el.kind) ? undefined : el.h
  };
}

/** The artwork for one piece, built only from brand styles. */
export function CustomElementArt({ el }: { el: CustomElement }) {
  switch (el.kind) {
    case "text": {
      const style = TEXT_STYLES[el.style];
      return (
        <div
          className={`sm-el-text${style.caps || style.mono ? "" : " sm-balance"}`}
          style={{
            fontSize: textPx(el),
            fontWeight: style.weight,
            fontFamily: style.mono ? "var(--sm-mono)" : undefined,
            fontVariantNumeric: style.mono ? "tabular-nums" : undefined,
            letterSpacing: `${style.tracking}em`,
            lineHeight: style.lineHeight,
            textTransform: style.caps ? "uppercase" : "none",
            color: TEXT_COLORS[el.color].css,
            textAlign: el.align
          }}
        >
          {el.text || " "}
        </div>
      );
    }
    case "photo":
      return <Photo photo={el.photo} />;
    case "plate":
      return <div style={{ width: "100%", height: "100%", background: PLATE_FILLS[el.fill].css }} />;
    case "icon":
      return (
        <div className="sm-el-icon" style={{ width: "100%", height: "100%" }}>
          <img src={STORY_ICON_SRC} alt="" />
        </div>
      );
    case "wordmark":
      return (
        <div className="sm-el-wordmark" style={{ width: "100%", height: "100%" }}>
          <Wordmark />
        </div>
      );
    case "header":
      return <Header kicker={el.kicker} meta={el.meta} />;
    case "footer":
      return <Footer source={el.source} />;
    case "follow":
      return <FollowPanel heading={el.heading} />;
  }
}
