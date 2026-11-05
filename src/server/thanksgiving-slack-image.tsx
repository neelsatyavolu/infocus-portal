/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements. */
import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import type { RankedEntry } from "@/src/lib/thanksgiving-board";
import { harvestBreakdown } from "@/src/lib/thanksgiving-slack";
import { loadThumbnailFonts } from "@/src/server/live-thumbnail";
import { readPublicFile } from "@/src/server/public-file";

/** The Thanksgiving leaderboard's top five for Slack, in the harvest colors (app/globals.css). */
export const HARVEST_IMAGE_SIZE = { width: 1600, height: 900 } as const;

const INK = "#0F110F";
const CARD = "#151815";
const LINE = "#252925";
const MIST = "#DCE2DE";
const INK_5 = "#6B726D";
const SOFT_WHITE = "#ECEFEA";
const GOLD = "#F2A93B";
const MAPLE = "#A4471C";
const CRANBERRY = "#C23A52";
/** public/thanksgiving/brand-wordmark-white.png is 1200 × 321. */
const WORDMARK_RATIO = 1200 / 321;

const caps: CSSProperties = { fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" };
const oneLine: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export type HarvestImageInput = {
  rows: RankedEntry[];
  title: string;
  stamp: string;
  footer: string;
};

function Row({ row, last }: { row: RankedEntry; last: boolean }) {
  const first = row.rank === 1;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 32,
        padding: "0 40px",
        borderBottom: last ? "none" : `1px solid ${LINE}`,
        background: first ? "rgba(242,169,59,0.10)" : "transparent"
      }}
    >
      <span style={{ width: 90, display: "flex", justifyContent: "flex-end", fontSize: 56, fontWeight: 600, color: first ? GOLD : MIST }}>
        {`#${row.rank}`}
      </span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ ...oneLine, maxWidth: 1000, fontSize: 44, fontWeight: 600, color: SOFT_WHITE }}>{row.name}</span>
        <span style={{ ...oneLine, maxWidth: 1000, fontSize: 22, color: MIST, marginTop: 6 }}>
          {[harvestBreakdown(row), row.bonus > 0 ? `+${row.bonus} harvest hour` : ""].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 60, fontWeight: 600, color: first ? GOLD : SOFT_WHITE }}>{String(row.total)}</span>
        <span style={{ ...caps, fontSize: 18, color: INK_5 }}>pts</span>
      </div>
    </div>
  );
}

export function HarvestSlackImage({ rows, title, stamp, footer, wordmark }: HarvestImageInput & { wordmark: string }) {
  return (
    <div
      style={{
        ...HARVEST_IMAGE_SIZE,
        display: "flex",
        flexDirection: "column",
        gap: 26,
        padding: "44px 56px 40px",
        background: INK,
        color: SOFT_WHITE,
        fontFamily: "Lexend"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 600, letterSpacing: "0.18em", color: GOLD }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: CRANBERRY }} />
            THANKSGIVING LEADERBOARD
          </div>
          <span style={{ fontSize: 50, fontWeight: 600, marginTop: 10 }}>{title}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          <img src={wordmark} alt="" width={Math.round(60 * WORDMARK_RATIO)} height={60} />
          <span style={{ fontSize: 20, color: MIST }}>{stamp}</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: CARD, border: `1px solid ${LINE}`, borderRadius: 8 }}>
        {rows.map((row, index) => (
          <Row key={row.userId} row={row} last={index === rows.length - 1} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: SOFT_WHITE }}>
        <div style={{ width: 6, height: 28, borderRadius: 3, background: MAPLE }} />
        {footer}
      </div>
    </div>
  );
}

/** The top-five PNG. */
export async function renderHarvestSlackImage(input: HarvestImageInput) {
  const [wordmark, fonts] = await Promise.all([readPublicFile("thanksgiving/brand-wordmark-white.png"), loadThumbnailFonts()]);
  const response = new ImageResponse(
    <HarvestSlackImage {...input} wordmark={`data:image/png;base64,${wordmark.toString("base64")}`} />,
    { ...HARVEST_IMAGE_SIZE, fonts: fonts.length ? fonts : undefined }
  );
  return new Uint8Array(await response.arrayBuffer());
}
