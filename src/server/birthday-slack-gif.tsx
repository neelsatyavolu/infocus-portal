/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements. */
import { decode } from "fast-png";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import { birthdayCardState, birthdayGifFrames, type BirthdayFramePhase } from "@/src/lib/birthday-slack";
import { fitWrappedFontSize } from "@/src/lib/live/thumbnail";
import { loadThumbnailAssets, loadThumbnailFonts } from "@/src/server/live-thumbnail";

/** The birthday card in Slack: the on-air Announcement card's look (DESIGN.md §6) at half size. */
export const BIRTHDAY_GIF_SIZE = { width: 960, height: 540 } as const;

const INK = "#0F110F";
const GREEN = "#0B6E3E";
const GREEN_ON_DARK = "#2BB36E";
const RECORD_RED = "#EE3A2A";
const SOFT_WHITE = "#ECEFEA";
const MIST = "#DCE2DE";
const RULE = "rgba(236,239,234,0.3)";
const WORDMARK_RATIO = 900 / 192;
const MARGIN = 60;
const ICON_SIZE = 150;
const STRIP_WIDTH = 430;
const STRIP_HEIGHT = 46;
const TEXT_WIDTH = BIRTHDAY_GIF_SIZE.width - 2 * MARGIN;
const GIF_COLORS = 128;

const abs = (style: CSSProperties): CSSProperties => ({ position: "absolute", display: "flex", ...style });

export function BirthdayCard({
  names,
  frame,
  assets
}: {
  names: string;
  frame: BirthdayFramePhase;
  assets: { wordmark: string; icon: string };
}) {
  const state = birthdayCardState(frame);
  const title = `${names}!`;
  const nameSize = fitWrappedFontSize(title, TEXT_WIDTH, 2, 132, 44, 0.6);
  const { width, height } = BIRTHDAY_GIF_SIZE;
  return (
    <div style={{ width, height, display: "flex", position: "relative", background: INK, color: SOFT_WHITE, fontFamily: "Lexend" }}>
      {/* The standby icon, first and last frame of the build; it turns like a lens focusing. */}
      <img
        src={assets.icon}
        alt=""
        width={ICON_SIZE}
        height={ICON_SIZE}
        style={abs({
          left: (width - ICON_SIZE) / 2,
          top: (height - ICON_SIZE) / 2,
          opacity: state.icon,
          transform: `rotate(${state.iconTurn}deg) scale(${0.82 + 0.18 * state.icon})`
        })}
      />
      <div style={abs({ left: 0, top: 0, width, height, opacity: state.content })}>
        <div style={abs({ left: MARGIN, top: MARGIN, height: 36, alignItems: "center" })}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: RECORD_RED, marginRight: 14, transform: `scale(${state.dot})` }} />
          <div style={{ display: "flex", overflow: "hidden", width: 200 * state.kicker }}>
            <span style={{ fontWeight: 600, fontSize: 19, letterSpacing: "0.18em", color: GREEN_ON_DARK, whiteSpace: "nowrap" }}>BIRTHDAY</span>
          </div>
        </div>
        <img
          src={assets.wordmark}
          alt=""
          width={Math.round(35 * WORDMARK_RATIO)}
          height={35}
          style={abs({ right: MARGIN, top: MARGIN, opacity: state.mark })}
        />
        <div style={abs({ left: MARGIN, top: MARGIN + 58, width: TEXT_WIDTH * state.rule, height: 1.5, background: RULE })} />
        <div style={abs({ left: MARGIN, top: 190 + 26 * (1 - state.title), width: TEXT_WIDTH, opacity: state.title, flexDirection: "column" })}>
          <span style={{ fontWeight: 600, fontSize: 30, color: MIST, letterSpacing: "-0.01em", marginBottom: 2 }}>Happy birthday,</span>
          <span style={{ fontWeight: 600, fontSize: nameSize, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{title}</span>
        </div>
        {/* The green strip wipes out from the left. */}
        <div style={abs({ left: MARGIN, bottom: MARGIN, width: STRIP_WIDTH * state.strip, height: STRIP_HEIGHT, overflow: "hidden" })}>
          <div style={{ display: "flex", flexShrink: 0, width: STRIP_WIDTH, height: STRIP_HEIGHT, alignItems: "center", paddingLeft: 20, background: GREEN }}>
            <span style={{ fontWeight: 500, fontSize: 17, letterSpacing: "0.11em", whiteSpace: "nowrap", opacity: state.stripText }}>
              FROM EVERYONE AT INFOCUS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function toRgba(png: ReturnType<typeof decode>) {
  if (png.depth !== 8 || (png.channels !== 3 && png.channels !== 4)) {
    throw new Error(`Unexpected birthday frame format: ${png.channels} channels at ${png.depth} bits`);
  }
  const data = png.data as Uint8Array;
  if (png.channels === 4) return data;
  const rgba = new Uint8Array(png.width * png.height * 4);
  for (let pixel = 0, from = 0; from < data.length; pixel += 4, from += 3) {
    rgba.set(data.subarray(from, from + 3), pixel);
    rgba[pixel + 3] = 255;
  }
  return rgba;
}

/** The looping birthday GIF for `names` ("Abby" or "Abby & Otto"). */
export async function renderBirthdayGif(names: string) {
  const [assets, fonts] = await Promise.all([loadThumbnailAssets(), loadThumbnailFonts()]);
  const { width, height } = BIRTHDAY_GIF_SIZE;
  const gif = GIFEncoder();
  for (const frame of birthdayGifFrames()) {
    const response = new ImageResponse(<BirthdayCard names={names} frame={frame} assets={assets} />, {
      width,
      height,
      fonts: fonts.length ? fonts : undefined
    });
    const rgba = toRgba(decode(new Uint8Array(await response.arrayBuffer())));
    const palette = quantize(rgba, GIF_COLORS);
    gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay: frame.delayMs });
  }
  gif.finish();
  return gif.bytes();
}
