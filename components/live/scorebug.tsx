/* eslint-disable @next/next/no-img-element -- broadcast graphics use plain img so OBS renders them without the image optimizer. */
import { useState, type CSSProperties } from "react";
import {
  TOUCHDOWN_MS,
  activeTags,
  clockMs,
  downText,
  formatClock,
  periodLabel,
  type ScoreboardState,
  type TeamIndex
} from "@/src/lib/live/scoreboard";
import { LIVE_ICON_SRC } from "./live-stage";

type BugProps = { state: ScoreboardState; now: number };

/** Lexend SemiBold caps with 0.04em tracking averages about 0.72em per character. */
const CAPS_EM = 0.72;
const NAME_MAX_PX = 40;
const NAME_MIN_PX = 24;

type NameLayout = { size: number; cell: number; nameMax: number };

/**
 * Sizes both team cells for the longer name: cells widen up to `maxCell`, then the name shrinks
 * (never below 24px). Both teams share one width, like the show's dual thirds.
 */
function nameLayout(state: ScoreboardState, minCell: number, maxCell: number, fixed: number): NameLayout {
  const longest = Math.max(1, ...state.teams.map((team, index) => (team.name || (index === 0 ? "HOME" : "AWAY")).length));
  const nameMax = maxCell - fixed;
  const natural = longest * NAME_MAX_PX * CAPS_EM;
  const size = natural <= nameMax ? NAME_MAX_PX : Math.max(NAME_MIN_PX, Math.floor(nameMax / (longest * CAPS_EM)));
  const cell = Math.max(minCell, Math.min(maxCell, Math.ceil(Math.min(nameMax, longest * size * CAPS_EM) + fixed)));
  return { size, cell, nameMax };
}

function TeamName({ state, team, layout }: { state: ScoreboardState; team: TeamIndex; layout: NameLayout }) {
  const name = state.teams[team].name || (team === 0 ? "HOME" : "AWAY");
  return (
    <span className="lv-name-text" style={{ fontSize: layout.size, maxWidth: layout.nameMax }}>
      {name}
    </span>
  );
}

function Tile({ size }: { size: number }) {
  return (
    <div className="lv-tile a-open" style={{ width: size, height: size }}>
      <img className="a-turn" src={LIVE_ICON_SRC} alt="" />
    </div>
  );
}

function Score({ state, team }: { state: ScoreboardState; team: TeamIndex }) {
  const score = state.teams[team].score;
  return (
    <span key={score} className="lv-sc">
      {score}
    </span>
  );
}

function Pips({ left, total }: { left: number; total: number }) {
  return (
    <span className="lv-pips">
      {Array.from({ length: total }, (_, index) => (
        <i key={index} className={index < left ? "on" : ""} />
      ))}
    </span>
  );
}

function Team({ state, team, mirror = false, layout }: { state: ScoreboardState; team: TeamIndex; mirror?: boolean; layout: NameLayout }) {
  const data = state.teams[team];
  const dotOn = state.sport === "football" ? state.possession === team : state.sport === "volleyball" ? state.serve === team : false;
  const showDot = state.sport === "football" || state.sport === "volleyball";
  return (
    <div className={`lv-team ${mirror ? "mir" : ""}`} style={{ width: layout.cell }}>
      <span className="lv-chip" style={{ background: data.color }} />
      <span className="lv-namecol">
        <span className="lv-name">
          <TeamName state={state} team={team} layout={layout} />
          {showDot ? <i className={`lv-poss ${dotOn ? "" : "off"}`} /> : null}
        </span>
        {state.sport === "football" ? <Pips left={data.timeouts} total={3} /> : null}
      </span>
      <span className="lv-grow" />
      <Score state={state} team={team} />
    </div>
  );
}

function Clock({ state, now }: BugProps) {
  if (!state.showClock || state.sport === "volleyball") return null;
  return <span className="lv-clk">{formatClock(clockMs(state.clock, now), state.sport)}</span>;
}

/**
 * Stable key for a tag. The dashboard shows a tap instantly and then gets the saved copy back with
 * a different id; keying by what the tag says keeps React from remounting (and replaying) it.
 */
function tagKey(tag: ScoreboardState["tags"][number]) {
  return `${tag.kind}-${tag.team ?? ""}-${tag.text}`;
}

function Tags({ state, now }: BugProps) {
  return (
    <>
      {activeTags(state, now, "timeout").map((tag) => (
        <span key={tagKey(tag)} className="lv-tag">
          {tag.text}
        </span>
      ))}
    </>
  );
}

/** Basketball and "other": bottom-center bar with a green info tier (ESPN/NBC pattern). */
function BarWithTier({ state, now }: BugProps) {
  const other = state.sport === "other";
  const layout = nameLayout(state, 300, 480, 178);
  return (
    <div className="lv-row">
      <Tile size={128} />
      <div className="lv-col">
        <div className="lv-main a-wipe" style={{ height: 88, paddingRight: 64, borderRadius: "0 88px 0 0" }}>
          <Team state={state} team={0} layout={layout} />
          <span className="lv-div" />
          <Team state={state} team={1} layout={layout} />
          <span className="lv-div" />
          <div className="lv-clock">
            <span className="lv-per">{periodLabel(state)}</span>
            <Clock state={state} now={now} />
          </div>
        </div>
        <div className="lv-tier a-wipe" style={{ "--d": "0.1s" } as CSSProperties}>
          {other ? (
            <span style={{ paddingLeft: 30 }}>{state.note}</span>
          ) : (
            <>
              <span className="tc" style={{ width: layout.cell + 2 }}>{state.teams[0].bonus ? "Bonus" : ""}</span>
              <span className="tc" style={{ width: layout.cell + 2 }}>{state.teams[1].bonus ? "Bonus" : ""}</span>
            </>
          )}
          <span className="lv-grow" />
          <Tags state={state} now={now} />
          <span style={{ width: 8 }} />
        </div>
      </div>
    </div>
  );
}

type Tag = ScoreboardState["tags"][number];

/**
 * How late the plate may first appear and still play from the start. OBS polls once a second, so it
 * usually sees a touchdown a little after the tap; later than this (a reload mid-celebration) it
 * resumes partway through instead.
 */
const TOUCHDOWN_LATE_MS = 1500;

/**
 * Green TOUCHDOWN plate: wipes out from the tile over the bar, holds, wipes back. The whole thing is
 * one CSS timeline fixed when the plate first appears, so later updates (the saved copy replacing the
 * instant one, overlay polls, clock ticks) can never restart or stutter it. It ends hidden.
 */
function Touchdown({ tag, state, now, width }: { tag: Tag; state: ScoreboardState; now: number; width: number }) {
  const team = tag.team ?? 0;
  const [delayMs] = useState(() => {
    const elapsed = now - (tag.until - TOUCHDOWN_MS);
    return elapsed > TOUCHDOWN_LATE_MS ? -Math.min(elapsed, TOUCHDOWN_MS) : 0;
  });
  const timeline = { "--td-duration": `${TOUCHDOWN_MS}ms`, "--td-delay": `${delayMs}ms` } as CSSProperties;
  return (
    <div className="lv-td" style={{ left: 96, width, ...timeline }} role="status">
      <span className="lv-chip" style={{ background: state.teams[team].color }} />
      <span className="lv-td-text">
        <b>Touchdown</b>
        <small>{tag.text}</small>
      </span>
    </div>
  );
}

/** Football: bottom-center bar, clock in the middle, down & distance above the team with the ball (NBC/FOX pattern). */
function FootballCenter({ state, now }: BugProps) {
  const down = downText(state, now);
  const flag = activeTags(state, now, "flag").length > 0;
  const layout = nameLayout(state, 380, 500, 204);
  const downLeft = state.possession === 1 ? 96 + layout.cell + 170 : 96;
  const timeouts = activeTags(state, now, "timeout");
  // Kept mounted a little past its end so a late start can finish its wipe back; the timeline ends hidden.
  const touchdown = state.tags.filter((tag) => tag.kind === "touchdown" && tag.until + TOUCHDOWN_LATE_MS > now).at(-1);
  return (
    <>
      <div className="lv-row">
        <Tile size={96} />
        <div className="lv-main a-wipe" style={{ height: 96, paddingRight: 56, borderRadius: "0 96px 0 0" }}>
          <Team state={state} team={0} layout={layout} />
          <div className="lv-center">
            <span className="lv-per w">{periodLabel(state)}</span>
            <Clock state={state} now={now} />
          </div>
          <Team state={state} team={1} layout={layout} mirror />
        </div>
        {down ? (
          <span className={`lv-down ${flag ? "flag" : ""}`} style={{ left: downLeft }}>
            {down}
          </span>
        ) : null}
        {touchdown ? <Touchdown key={tagKey(touchdown)} tag={touchdown} state={state} now={now} width={layout.cell * 2 + 170 + 56} /> : null}
      </div>
      {timeouts.length ? (
        <div className="lv-temp" style={{ left: 96 }}>
          <Tags state={state} now={now} />
        </div>
      ) : null}
    </>
  );
}

/** Volleyball: two-row rectangle with sets won and highlighted live points (FIVB VNL pattern). */
function VolleyballRows({ state, now }: BugProps) {
  const setTag = activeTags(state, now, "set")[0];
  const layout = nameLayout(state, 620, 760, 312);
  return (
    <div className="lv-row">
      <Tile size={144} />
      <div className="lv-col">
        <div className="lv-rows a-wipe" style={{ width: layout.cell }}>
          {([0, 1] as const).map((team) => {
            const data = state.teams[team];
            return (
              <div key={team} className="lv-vr">
                <span className="lv-chip" style={{ background: data.color }} />
                <span className="lv-name">
                  <TeamName state={state} team={team} layout={layout} />
                  <i className={`lv-poss ${state.serve === team ? "" : "off"}`} />
                </span>
                <span className="lv-grow" />
                <span className="lv-sets">
                  <small>Sets</small>
                  <b>{data.sets}</b>
                </span>
                <span className="lv-pts">
                  <Score state={state} team={team} />
                </span>
              </div>
            );
          })}
        </div>
        <div className="lv-tier a-wipe" style={{ padding: "0 30px", "--d": "0.1s" } as CSSProperties}>
          {setTag ? (
            <span key={tagKey(setTag)} className="lv-tag">
              {setTag.text}
            </span>
          ) : (
            <span>{periodLabel(state)}</span>
          )}
          <span className="lv-grow" />
          <Tags state={state} now={now} />
        </div>
      </div>
    </div>
  );
}

function bugPosition(state: ScoreboardState): CSSProperties {
  const bottom = state.position === "bottom";
  const vertical: CSSProperties = bottom ? { bottom: 108 } : { top: state.sport === "football" ? 112 : 56 };
  if (state.sport === "volleyball") return { ...vertical, left: bottom ? 150 : 64 };
  return { ...vertical, left: "50%", transform: "translateX(-50%)" };
}

/** The scorebug for the board's sport, placed on the 1920 × 1080 stage. */
export function Scorebug({ state, now }: BugProps) {
  const Variant = state.sport === "football" ? FootballCenter : state.sport === "volleyball" ? VolleyballRows : BarWithTier;
  return (
    <div className="lv-bug" style={bugPosition(state)}>
      <Variant state={state} now={now} />
    </div>
  );
}
