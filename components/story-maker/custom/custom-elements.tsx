/* eslint-disable @next/next/no-img-element -- story artwork is exported to PNG from the DOM; next/image would not embed. */
import type { CSSProperties } from "react";
import { PLATE_FILLS, TEXT_COLORS, TEXT_STYLES, textPx, type CustomElement } from "@/src/lib/story-custom";
import { FollowPanel, Footer, Header, Photo, STORY_ICON_SRC } from "../story-templates";

/** Where a piece sits. Auto-height pieces (text, header, footer, follow) only fix their width. */
export function elementBox(el: CustomElement): CSSProperties {
  const autoHeight = el.kind === "text" || el.kind === "header" || el.kind === "footer" || el.kind === "follow";
  return {
    left: el.x,
    top: el.y,
    width: el.kind === "header" ? undefined : el.w,
    height: autoHeight ? undefined : el.h
  };
}

/** The artwork for one piece, built only from brand styles. */
export function CustomElementArt({ el }: { el: CustomElement }) {
  switch (el.kind) {
    case "text": {
      const style = TEXT_STYLES[el.style];
      return (
        <div
          className={`sm-el-text${style.caps ? "" : " sm-balance"}`}
          style={{
            fontSize: textPx(el),
            fontWeight: style.weight,
            letterSpacing: `${style.tracking}em`,
            lineHeight: style.lineHeight,
            textTransform: style.caps ? "uppercase" : "none",
            color: TEXT_COLORS[el.color],
            textAlign: el.align
          }}
        >
          {el.text || "\u00a0"}
        </div>
      );
    }
    case "photo":
      return <Photo photo={el.photo} />;
    case "plate":
      return <div style={{ width: "100%", height: "100%", background: PLATE_FILLS[el.fill] }} />;
    case "icon":
      return (
        <div className="sm-el-icon" style={{ width: "100%", height: "100%" }}>
          <img src={STORY_ICON_SRC} alt="" />
        </div>
      );
    case "header":
      return <Header kicker={el.kicker} meta={el.meta} />;
    case "footer":
      return <Footer />;
    case "follow":
      return <FollowPanel heading={el.heading} all />;
  }
}
