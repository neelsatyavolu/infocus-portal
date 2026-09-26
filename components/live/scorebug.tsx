/* eslint-disable @next/next/no-img-element -- broadcast graphics use plain img so OBS renders them without the image optimizer. */
import type { CSSProperties } from "react";
import {
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

function Team({ state, team, mirror = false, width }: { state: ScoreboardState; team: TeamIndex; mirror?: boolean; width: number }) {
  const data = state.teams[team];
  const dotOn = state.sport === "football" ? state.possession === team : state.sport === "volleyball" ? state.serve === team : false;
  const showDot = state.sport === "football" || state.sport === "volleyball";
  return (
    <div className={`lv-team ${mirror ? "mir" : ""}`} style={{ width }}>
      <span className="lv-chip" style={{ background: data.color }} />
      <span className="lv-namecol">
        <span className="lv-name">
          {data.name || (team === 0 ? "HOME" : "AWAY")}
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

function Tags({ state, now }: BugProps) {
  return (
    <>
      {activeTags(state, now, "timeout").map((tag) => (
        <span key={tag.id} className="lv-tag">
          {tag.text}
        </span>
      ))}
    </>
  );
}

/** Basketball and "other": bottom-center bar with a green info tier (ESPN/NBC pattern). */
function BarWithTier({ state, now }: BugProps) {
  const other = state.sport === "other";
  return (
    <div className="lv-row">
      <Tile size={128} />
      <div className="lv-col">
        <div className="lv-main a-wipe" style={{ height: 88, paddingRight: 64, borderRadius: "0 88px 0 0" }}>
          <Team state={state} team={0} width={300} />
          <span className="lv-div" />
          <Team state={state} team={1} width={300} />
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
              <span className="tc">{state.teams[0].bonus ? "Bonus" : ""}</span>
              <span className="tc">{state.teams[1].bonus ? "Bonus" : ""}</span>
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

/** Football: bottom-center bar, clock in the middle, down & distance above the team with the ball (NBC/FOX pattern). */
function FootballCenter({ state, now }: BugProps) {
  const down = downText(state, now);
  const flag = activeTags(state, now, "flag").length > 0;
  const downLeft = state.possession === 1 ? 96 + 380 + 170 : 96;
  const timeouts = activeTags(state, now, "timeout");
  return (
    <>
      <div className="lv-row">
        <Tile size={96} />
        <div className="lv-main a-wipe" style={{ height: 96, paddingRight: 56, borderRadius: "0 96px 0 0" }}>
          <Team state={state} team={0} width={380} />
          <div className="lv-center">
            <span className="lv-per w">{periodLabel(state)}</span>
            <Clock state={state} now={now} />
          </div>
          <Team state={state} team={1} width={380} mirror />
        </div>
        {down ? (
          <span className={`lv-down ${flag ? "flag" : ""}`} style={{ left: downLeft }}>
            {down}
          </span>
        ) : null}
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
  return (
    <div className="lv-row">
      <Tile size={144} />
      <div className="lv-col">
        <div className="lv-rows a-wipe">
          {([0, 1] as const).map((team) => {
            const data = state.teams[team];
            return (
              <div key={team} className="lv-vr">
                <span className="lv-chip" style={{ background: data.color }} />
                <span className="lv-name">
                  {data.name || (team === 0 ? "HOME" : "AWAY")}
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
            <span key={setTag.id} className="lv-tag">
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
