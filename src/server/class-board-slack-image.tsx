/* eslint-disable @next/next/no-img-element -- next/og renders plain img elements. */
import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import { gateTvLabel } from "@/app/(app)/class-board/board-format";
import type { ClassBoardGate, ClassBoardLane, RaceDot } from "@/src/lib/class-board";
import type { GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { extensionBadgeLabel } from "@/src/lib/package-extensions";
import { loadThumbnailAssets, loadThumbnailFonts } from "@/src/server/live-thumbnail";

/** The Class Board standings picture for Slack: the race only, every lane, in the board's look. */
export const CLASS_BOARD_IMAGE_SIZE = { width: 1600, height: 900 } as const;

const INK = "#0F110F";
const CARD = "#151815";
const LINE = "#252925";
const INK_5 = "#6B726D";
const SOFT_WHITE = "#ECEFEA";
const MIST = "#DCE2DE";
const GREEN = "#2BB36E";
const AMBER = "#F2A516";
const RECORD_RED = "#EE3A2A";
const DANGER = "#C21F3A";
const WORDMARK_RATIO = 900 / 192;

/** Column widths inside the race card (1430px between its side paddings). */
const COLUMNS = { place: 64, pkg: 378, track: 560, status: 344, gap: 28 } as const;
const PAD_X = 56;
const HEAD_HEIGHT = 72;
/** Height left for the lanes once the title band, gaps and column heads are drawn. */
const LANES_HEIGHT = 604;

const TAG: Record<GroupTileStatusTone, CSSProperties> = {
  approved: { background: "rgba(43,179,110,0.14)", color: GREEN, borderColor: "rgba(43,179,110,0.30)" },
  warn: { background: "rgba(242,165,22,0.16)", color: AMBER, borderColor: "rgba(242,165,22,0.40)" },
  review: { background: INK, color: SOFT_WHITE, borderColor: LINE },
  danger: { background: "#3A1218", color: "#FF7A8A", borderColor: "rgba(255,122,138,0.40)" },
  neutral: { background: CARD, color: MIST, borderColor: LINE }
};

const CURRENT: Record<GroupTileStatusTone, string> = {
  approved: GREEN,
  warn: AMBER,
  review: SOFT_WHITE,
  danger: DANGER,
  neutral: SOFT_WHITE
};

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));
const caps: CSSProperties = { fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase" };
const oneLine: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** Type and dot sizes follow the lane height, so eight lanes get big type and twenty still fit. */
function laneScale(count: number) {
  const height = LANES_HEIGHT / Math.max(count, 1);
  return {
    height,
    compact: height < 54,
    place: clamp(height * 0.42, 16, 34),
    title: clamp(height * 0.3, 14, 24),
    meta: clamp(height * 0.22, 12, 18),
    tag: clamp(height * 0.2, 12, 15),
    dot: clamp(height * 0.2, 9, 16),
    dotNow: clamp(height * 0.28, 12, 22)
  };
}

type Scale = ReturnType<typeof laneScale>;

function segmentColor(state: RaceDot, tone: GroupTileStatusTone) {
  if (state === "done") return GREEN;
  if (state === "upcoming") return "rgba(107,114,109,0.6)";
  return CURRENT[tone];
}

function Track({ lane, scale }: { lane: ClassBoardLane; scale: Scale }) {
  const cell = COLUMNS.track / Math.max(lane.dots.length, 1);
  return (
    <div style={{ width: COLUMNS.track, height: scale.dotNow + 10, display: "flex", position: "relative", alignItems: "center" }}>
      <div style={{ position: "absolute", left: cell / 2, right: cell / 2, top: (scale.dotNow + 10) / 2 - 1.5, height: 3, display: "flex" }}>
        {lane.segments.map((segment, index) => (
          <div key={index} style={{ flex: 1, height: 3, background: segmentColor(segment, lane.tone) }} />
        ))}
      </div>
      {lane.dots.map((dot, index) => (
        <div key={index} style={{ width: cell, display: "flex", justifyContent: "center" }}>
          {dot === "done" ? (
            <div style={{ width: scale.dot, height: scale.dot, borderRadius: 999, background: GREEN }} />
          ) : dot === "upcoming" ? (
            <div style={{ width: scale.dot, height: scale.dot, borderRadius: 999, border: `2px solid ${INK_5}`, background: CARD }} />
          ) : (
            <div
              style={{
                width: scale.dotNow,
                height: scale.dotNow,
                borderRadius: 999,
                background: CURRENT[lane.tone],
                boxShadow: `0 0 0 4px ${CURRENT[lane.tone]}55`
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Lane({ lane, scale, last }: { lane: ClassBoardLane; scale: Scale; last: boolean }) {
  const extension = lane.extension ? extensionBadgeLabel(lane.extensionDays) : null;
  const names = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: scale.meta, color: MIST, marginTop: scale.compact ? 0 : 4 }}>
      <span style={{ ...oneLine, maxWidth: extension ? 210 : COLUMNS.pkg }}>{lane.detail}</span>
      {extension ? (
        <span style={{ ...TAG.warn, border: `1px solid ${TAG.warn.borderColor}`, borderRadius: 6, padding: "1px 6px", fontSize: scale.tag - 2 }}>
          {extension}
        </span>
      ) : null}
    </div>
  );
  return (
    <div
      style={{
        height: scale.height,
        display: "flex",
        alignItems: "center",
        gap: COLUMNS.gap,
        padding: "0 28px",
        borderBottom: last ? "none" : `1px solid ${LINE}`,
        background: lane.packageOfCycle ? "rgba(43,179,110,0.08)" : "transparent"
      }}
    >
      <span
        style={{
          width: COLUMNS.place,
          display: "flex",
          justifyContent: "flex-end",
          fontSize: scale.place,
          fontWeight: 500,
          color: lane.place === 1 ? GREEN : MIST
        }}
      >
        {String(lane.place)}
      </span>
      <div
        style={{
          width: COLUMNS.pkg,
          display: "flex",
          flexDirection: scale.compact ? "row" : "column",
          alignItems: scale.compact ? "center" : "flex-start",
          gap: scale.compact ? 10 : 0
        }}
      >
        <span style={{ ...oneLine, maxWidth: scale.compact ? 230 : COLUMNS.pkg, fontSize: scale.title, fontWeight: 600, color: SOFT_WHITE }}>
          {lane.topic}
        </span>
        {names}
      </div>
      <Track lane={lane} scale={scale} />
      <div style={{ width: COLUMNS.status, display: "flex" }}>
        <span
          style={{
            ...TAG[lane.tone],
            // Tall lanes let a long status wrap to a second line; short ones keep it to one.
            ...(scale.compact ? oneLine : {}),
            maxWidth: COLUMNS.status,
            border: `1px solid ${TAG[lane.tone].borderColor}`,
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: scale.tag,
            fontWeight: 500
          }}
        >
          {lane.statusLabel}
        </span>
      </div>
    </div>
  );
}

export function ClassBoardSlackImage({
  cycleNumber,
  gates,
  lanes,
  stamp,
  wordmark
}: {
  cycleNumber: number;
  gates: ClassBoardGate[];
  lanes: ClassBoardLane[];
  stamp: string;
  wordmark: string;
}) {
  const scale = laneScale(lanes.length);
  const gateWidth = COLUMNS.track / Math.max(gates.length, 1);
  return (
    <div
      style={{
        ...CLASS_BOARD_IMAGE_SIZE,
        display: "flex",
        flexDirection: "column",
        gap: 26,
        padding: `44px ${PAD_X}px 40px`,
        background: INK,
        color: SOFT_WHITE,
        fontFamily: "Lexend"
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 600, letterSpacing: "0.18em", color: GREEN }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: RECORD_RED }} />
            CLASS BOARD
          </div>
          <span style={{ fontSize: 46, fontWeight: 600, marginTop: 10 }}>{`Cycle ${cycleNumber} Progress`}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          <img src={wordmark} alt="" width={Math.round(54 * WORDMARK_RATIO)} height={54} />
          <span style={{ fontSize: 20, color: MIST }}>{stamp}</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: CARD, border: `1px solid ${LINE}`, borderRadius: 6 }}>
        <div style={{ height: HEAD_HEIGHT, display: "flex", alignItems: "center", gap: COLUMNS.gap, padding: "0 28px", borderBottom: `1px solid ${LINE}` }}>
          <span style={{ ...caps, width: COLUMNS.place, display: "flex", justifyContent: "flex-end", fontSize: 15, color: INK_5 }}>#</span>
          <span style={{ ...caps, width: COLUMNS.pkg, fontSize: 15, color: INK_5 }}>Package</span>
          <div style={{ width: COLUMNS.track, display: "flex" }}>
            {gates.map((gate) => (
              <div key={gate.key} style={{ width: gateWidth, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ ...caps, letterSpacing: "0", fontSize: 15, color: SOFT_WHITE }}>{gateTvLabel(gate)}</span>
                <span style={{ fontSize: 13, color: INK_5, marginTop: 3 }}>{gate.dateLabel ?? "—"}</span>
              </div>
            ))}
          </div>
          <span style={{ ...caps, width: COLUMNS.status, fontSize: 15, color: INK_5 }}>Status</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {lanes.map((lane, index) => (
            <Lane key={lane.id} lane={lane} scale={scale} last={index === lanes.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The standings PNG. */
export async function renderClassBoardSlackImage(input: {
  cycleNumber: number;
  gates: ClassBoardGate[];
  lanes: ClassBoardLane[];
  stamp: string;
}) {
  const [assets, fonts] = await Promise.all([loadThumbnailAssets(), loadThumbnailFonts()]);
  const response = new ImageResponse(<ClassBoardSlackImage {...input} wordmark={assets.wordmark} />, {
    ...CLASS_BOARD_IMAGE_SIZE,
    fonts: fonts.length ? fonts : undefined
  });
  return new Uint8Array(await response.arrayBuffer());
}
