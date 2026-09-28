/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties, ReactElement } from "react";
import {
  fitFontSize,
  fitWrappedFontSize,
  formatThumbnailDate,
  formatThumbnailTime,
  type ThumbnailQuery
} from "@/src/lib/live/thumbnail";

const INK = "#0F110F";
const GREEN = "#0B6E3E";
const GREEN_ON_DARK = "#2BB36E";
const MIST = "#DCE2DE";
const RULE = "rgba(255,255,255,0.3)";
const WORDMARK_RATIO = 900 / 192;

type Assets = { wordmark: string; icon: string };

let assetsPromise: Promise<Assets> | null = null;

/** Logo files from public/live (listed in next.config outputFileTracingIncludes). */
export function loadThumbnailAssets() {
  assetsPromise ??= Promise.all([
    readFile(path.join(process.cwd(), "public/live/infocus-wordmark-white.png")),
    readFile(path.join(process.cwd(), "public/live/infocus-icon.png"))
  ]).then(([wordmark, icon]) => ({
    wordmark: `data:image/png;base64,${wordmark.toString("base64")}`,
    icon: `data:image/png;base64,${icon.toString("base64")}`
  }));
  return assetsPromise;
}

const fontCache = new Map<number, Promise<ArrayBuffer | null>>();

/** Lexend from Google Fonts as TrueType (what next/og needs). Returns null if it can't be fetched. */
export function loadLexend(weight: number) {
  const cached = fontCache.get(weight);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Lexend:wght@${weight}`)).text();
      const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
      if (!url) return null;
      const response = await fetch(url);
      return response.ok ? await response.arrayBuffer() : null;
    } catch {
      return null;
    }
  })();
  fontCache.set(weight, promise);
  promise.then((font) => {
    if (!font) fontCache.delete(weight);
  });
  return promise;
}

export async function loadThumbnailFonts() {
  const weights = [500, 600] as const;
  const fonts = await Promise.all(weights.map((weight) => loadLexend(weight)));
  return fonts.flatMap((data, index) =>
    data ? [{ name: "Lexend", data, weight: weights[index], style: "normal" as const }] : []
  );
}

const kicker: CSSProperties = { fontWeight: 500, letterSpacing: "0.18em", color: GREEN_ON_DARK, textTransform: "uppercase" };
const caps: CSSProperties = { fontWeight: 500, letterSpacing: "0.11em", textTransform: "uppercase" };
const abs = (style: CSSProperties): CSSProperties => ({ position: "absolute", display: "flex", ...style });

function Wordmark({ src, height, style }: { src: string; height: number; style?: CSSProperties }) {
  return <img src={src} alt="" width={Math.round(height * WORDMARK_RATIO)} height={height} style={style} />;
}

function whenLine(query: ThumbnailQuery, withLocation: boolean) {
  const date = formatThumbnailDate(query.date);
  const parts = [date.short && `${date.short}, ${date.monthDay}`, formatThumbnailTime(query.time), withLocation ? query.location : ""];
  return parts.filter(Boolean).join(" · ");
}

function MatchupYouTube(query: ThumbnailQuery, assets: Assets) {
  const size = Math.min(190, Math.floor(1152 / ((query.home.length + query.away.length) * 0.62 + 1.1)));
  const when = whenLine(query, true);
  return (
    <div style={{ width: 1280, height: 720, display: "flex", position: "relative", background: INK, color: "#fff", fontFamily: "Lexend" }}>
      <div style={abs({ left: 64, right: 64, top: 0, height: 128, alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${RULE}` })}>
        <span style={{ ...kicker, fontSize: 26 }}>Livestream</span>
        <Wordmark src={assets.wordmark} height={46} />
      </div>
      <div style={abs({ left: 64, right: 64, top: 150, height: 400, alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: size, letterSpacing: "-0.02em" })}>
        <span>{query.home}</span>
        <span style={{ ...caps, letterSpacing: "0.18em", fontSize: Math.round(size * 0.28), color: MIST, margin: `0 ${Math.round(size * 0.2)}px` }}>vs</span>
        <span>{query.away}</span>
      </div>
      <div style={abs({ left: 0, bottom: 0, width: 1080, height: 160, background: GREEN, borderTopRightRadius: 160, flexDirection: "column", justifyContent: "center", paddingLeft: 64, gap: 8 })}>
        {query.line ? <span style={{ ...caps, fontSize: 28 }}>{query.line}</span> : null}
        <span style={{ fontWeight: 600, fontSize: fitFontSize(when, 880, 46, 28), letterSpacing: "-0.01em" }}>{when}</span>
      </div>
    </div>
  );
}

function MatchupTall(query: ThumbnailQuery, assets: Assets, story: boolean) {
  const height = story ? 1920 : 1350;
  const nameSize = (name: string) => fitFontSize(name, 936, story ? 230 : 210, 90);
  const top = story ? 250 : 0;
  return (
    <div style={{ width: 1080, height, display: "flex", position: "relative", background: INK, color: "#fff", fontFamily: "Lexend" }}>
      <div style={abs({ left: 72, right: 72, top, height: story ? 130 : 150, alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${RULE}` })}>
        <span style={{ ...kicker, fontSize: 30 }}>Livestream</span>
        <Wordmark src={assets.wordmark} height={52} />
      </div>
      <div style={abs({ left: 72, right: 72, top: story ? 430 : 200, height: story ? 800 : 700, flexDirection: "column", justifyContent: "center", fontWeight: 600, letterSpacing: "-0.02em" })}>
        <span style={{ fontSize: nameSize(query.home), lineHeight: 1.02 }}>{query.home}</span>
        <span style={{ ...caps, letterSpacing: "0.18em", fontSize: 48, color: MIST, padding: "12px 0 18px" }}>vs</span>
        <span style={{ fontSize: nameSize(query.away), lineHeight: 1.02 }}>{query.away}</span>
      </div>
      <div style={abs({ left: 0, bottom: story ? 250 : 0, width: 980, height: story ? 400 : 350, background: GREEN, borderTopRightRadius: 120, padding: "0 72px", flexDirection: "column", justifyContent: "center", gap: 12 })}>
        {query.line ? <span style={{ ...caps, fontSize: 32 }}>{query.line}</span> : null}
        <span style={{ fontWeight: 600, fontSize: fitFontSize(whenLine(query, false), 836, 64, 40), letterSpacing: "-0.01em" }}>{whenLine(query, false)}</span>
        {query.location ? <span style={{ fontWeight: 500, fontSize: 38 }}>{query.location}</span> : null}
        <span style={{ fontWeight: 500, fontSize: 28, color: MIST, marginTop: 8 }}>Live on YouTube · @infocusnews</span>
      </div>
    </div>
  );
}

function DatePlate({ query, style, big, promo }: { query: ThumbnailQuery; style: CSSProperties; big: number; promo: boolean }) {
  const date = formatThumbnailDate(query.date);
  return (
    <div style={abs({ background: GREEN, flexDirection: "column", gap: 12, ...style })}>
      <span style={{ ...caps, letterSpacing: "0.18em", fontSize: 30 }}>{date.long}</span>
      <span style={{ fontWeight: 600, fontSize: big, lineHeight: 0.95, letterSpacing: "-0.02em" }}>{date.monthDay}</span>
      <div style={{ display: "flex", height: 3, background: RULE, margin: "14px 0 4px" }} />
      <span style={{ fontWeight: 600, fontSize: Math.round(big * 0.48) }}>{formatThumbnailTime(query.time)}</span>
      {promo ? <span style={{ fontWeight: 500, fontSize: 28, color: MIST, marginTop: 8 }}>Live on YouTube · @infocusnews</span> : null}
    </div>
  );
}

function EventYouTube(query: ThumbnailQuery, assets: Assets) {
  const title = query.title || "Livestream";
  return (
    <div style={{ width: 1280, height: 720, display: "flex", position: "relative", background: INK, color: "#fff", fontFamily: "Lexend" }}>
      <span style={{ ...kicker, position: "absolute", left: 64, top: 72, fontSize: 26 }}>Livestream</span>
      <div style={abs({ left: 64, top: 128, width: 700, height: 360, fontWeight: 600, fontSize: fitWrappedFontSize(title, 700, 3, 116, 56), lineHeight: 1.02, letterSpacing: "-0.02em" })}>
        {title}
      </div>
      <span style={{ position: "absolute", left: 64, top: 512, fontWeight: 500, fontSize: 34, color: MIST }}>{query.location}</span>
      <Wordmark src={assets.wordmark} height={44} style={{ position: "absolute", left: 64, bottom: 60 }} />
      <DatePlate query={query} big={118} promo={false} style={{ right: 0, top: 88, bottom: 88, width: 420, borderTopLeftRadius: 120, padding: "88px 56px 48px" }} />
    </div>
  );
}

function EventTall(query: ThumbnailQuery, assets: Assets, story: boolean) {
  const title = query.title || "Livestream";
  return (
    <div style={{ width: 1080, height: story ? 1920 : 1350, display: "flex", position: "relative", background: INK, color: "#fff", fontFamily: "Lexend" }}>
      <span style={{ ...kicker, position: "absolute", left: 72, top: story ? 290 : 110, fontSize: 30 }}>Livestream</span>
      <div style={abs({ left: 72, right: 72, top: story ? 350 : 170, height: story ? 560 : 470, fontWeight: 600, fontSize: fitWrappedFontSize(title, 936, story ? 4 : 3, story ? 140 : 128, 64), lineHeight: 1.02, letterSpacing: "-0.02em" })}>
        {title}
      </div>
      <span style={{ position: "absolute", left: 72, top: story ? 940 : 668, fontWeight: 500, fontSize: 40, color: MIST }}>{query.location}</span>
      <Wordmark src={assets.wordmark} height={50} style={{ position: "absolute", left: 72, bottom: story ? 262 : 120 }} />
      <DatePlate
        query={query}
        big={128}
        promo
        style={{ right: 0, bottom: story ? 250 : 120, width: 640, height: story ? 560 : 480, borderTopLeftRadius: 120, padding: `${story ? 110 : 76}px 72px 48px` }}
      />
    </div>
  );
}

export function renderThumbnail(query: ThumbnailQuery, assets: Assets): ReactElement {
  const tall = query.format !== "youtube";
  const story = query.format === "story";
  if (query.template === "event") return tall ? EventTall(query, assets, story) : EventYouTube(query, assets);
  return tall ? MatchupTall(query, assets, story) : MatchupYouTube(query, assets);
}
