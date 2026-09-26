/* eslint-disable @next/next/no-img-element -- broadcast graphics use plain img so OBS renders them without the image optimizer. */
import type { CSSProperties } from "react";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import type { GraphicId } from "@/src/lib/live/graphics";
import type { ScoreboardState } from "@/src/lib/live/scoreboard";
import { LIVE_ICON_SRC, LIVE_WORDMARK_SRC } from "./live-stage";

type GraphicProps = {
  graphic: GraphicId;
  fields: Record<string, string>;
  scoreboard: ScoreboardState;
  event: LiveEventSummary;
  now: number;
};

const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

function HeaderBand({ kicker, dot }: { kicker: string; dot: boolean }) {
  return (
    <div className="lv-hb a-fade">
      <span className="lv-kicker">
        {dot ? <span className="lv-dot" /> : null}
        {kicker}
      </span>
      <img src={LIVE_WORDMARK_SRC} alt="" />
    </div>
  );
}

function LowerThird({ name, role, side, offset }: { name: string; role: string; side: "left" | "right"; offset: number }) {
  const mirror = side === "right";
  const wipe = mirror ? "a-wipe-r" : "a-wipe";
  return (
    <div className={`lv-l3 ${mirror ? "mir" : ""}`} style={mirror ? { right: offset } : { left: offset }}>
      <div className="lv-tile a-open">
        <img className="a-turn" src={LIVE_ICON_SRC} alt="" />
      </div>
      <div className="lv-l3-body">
        <div className={`lv-l3-plate ${wipe}`}>{name}</div>
        <div className={`lv-l3-strip ${wipe}`} style={delay(0.1)}>
          {role}
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ scoreboard }: { scoreboard: ScoreboardState }) {
  const [home, away] = scoreboard.teams;
  const homeLoses = home.score < away.score;
  const awayLoses = away.score < home.score;
  return (
    <div className="lv-score-row a-rise" style={delay(0.1)}>
      <span className={`nm ${homeLoses ? "lose" : ""}`}>{home.name}</span>
      <span className={`big ${homeLoses ? "lose" : ""}`}>{home.score}</span>
      <span className="dash" />
      <span className={`big ${awayLoses ? "lose" : ""}`}>{away.score}</span>
      <span className={`nm r ${awayLoses ? "lose" : ""}`}>{away.name}</span>
    </div>
  );
}

/** Per-period points from cumulative period scores, with the current period last. */
function periodRows(scoreboard: ScoreboardState) {
  const cumulative = scoreboard.periodScores.concat([[scoreboard.teams[0].score, scoreboard.teams[1].score]]);
  const periods = Math.max(4, cumulative.length);
  const perTeam = ([0, 1] as const).map((team) =>
    Array.from({ length: periods }, (_, index) => {
      if (index >= cumulative.length) return "–";
      const previous = index === 0 ? 0 : cumulative[index - 1][team];
      return String(cumulative[index][team] - previous);
    })
  );
  const labels = Array.from({ length: periods }, (_, index) => (index < 4 ? `Q${index + 1}` : index === 4 ? "OT" : `${index - 3}OT`));
  return { labels, perTeam };
}

function PeriodTable({ scoreboard }: { scoreboard: ScoreboardState }) {
  if (scoreboard.sport === "volleyball") {
    if (!scoreboard.setHistory.length) return null;
    return (
      <table className="lv-qtable a-rise" style={delay(0.25)}>
        <thead>
          <tr>
            <th />
            {scoreboard.setHistory.map((_, index) => (
              <th key={index}>Set {index + 1}</th>
            ))}
            <th>Sets</th>
          </tr>
        </thead>
        <tbody>
          {([0, 1] as const).map((team) => (
            <tr key={team}>
              <td>{scoreboard.teams[team].name}</td>
              {scoreboard.setHistory.map((set, index) => (
                <td key={index}>{set[team]}</td>
              ))}
              <td className="tot">{scoreboard.teams[team].sets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (scoreboard.sport === "other") return null;
  const { labels, perTeam } = periodRows(scoreboard);
  return (
    <table className="lv-qtable a-rise" style={delay(0.25)}>
      <thead>
        <tr>
          <th />
          {labels.map((label) => (
            <th key={label}>{label}</th>
          ))}
          <th>T</th>
        </tr>
      </thead>
      <tbody>
        {([0, 1] as const).map((team) => (
          <tr key={team}>
            <td>{scoreboard.teams[team].name}</td>
            {perTeam[team].map((value, index) => (
              <td key={index}>{value}</td>
            ))}
            <td className="tot">{scoreboard.teams[team].score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function countdown(event: LiveEventSummary, now: number) {
  const remaining = new Date(event.startsAt).getTime() - now;
  if (remaining <= 0) return null;
  const seconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/** One pushed graphic, drawn on the 1920 × 1080 stage. */
export function LiveGraphic({ graphic, fields, scoreboard, event, now }: GraphicProps) {
  const field = (key: string) => fields[key] ?? "";

  switch (graphic) {
    case "starting-soon": {
      const left = countdown(event, now);
      return (
        <div className="lv-card">
          <HeaderBand kicker="Starting soon" dot />
          <div className="lv-ss-title a-rise" style={delay(0.1)}>{field("title")}</div>
          <div className="lv-ss-sub a-rise" style={delay(0.2)}>{field("subtitle")}</div>
          <div className="lv-ss-plate a-wipe" style={delay(0.2)}>
            {left ? (
              <>
                <span className="lbl">Stream starts in</span>
                <span className="cd">{left}</span>
              </>
            ) : (
              <span className="now">Starting now</span>
            )}
          </div>
          <div className="lv-follow a-rise" style={delay(0.4)}>
            <span><b>@infocusnews</b> Instagram · YouTube</span>
            <span><b>@palyinfocus</b> TikTok · X</span>
            <span><b>infocusnews.tv</b></span>
          </div>
        </div>
      );
    }
    case "commentators":
      return (
        <>
          {field("leftName") ? <LowerThird name={field("leftName")} role={field("leftRole")} side="left" offset={290} /> : null}
          {field("rightName") ? <LowerThird name={field("rightName")} role={field("rightRole")} side="right" offset={290} /> : null}
        </>
      );
    case "spotlight":
      return <LowerThird name={field("player")} role={field("stats")} side="left" offset={150} />;
    case "halftime":
      return (
        <div className="lv-card">
          <HeaderBand kicker={field("heading")} dot />
          <ScoreRow scoreboard={scoreboard} />
          <PeriodTable scoreboard={scoreboard} />
          <div className="lv-footer a-rise" style={delay(0.4)}>{field("footer")}</div>
        </div>
      );
    case "brb":
      return (
        <div className="lv-card">
          <div className="lv-brb-icon a-open">
            <img className="a-turn" src={LIVE_ICON_SRC} alt="" />
          </div>
          <div className="lv-brb-t a-rise">{field("headline")}</div>
          <div className="lv-brb-s a-rise" style={delay(0.1)}>{field("line")}</div>
        </div>
      );
    case "final":
      return (
        <div className="lv-card">
          <HeaderBand kicker={field("heading")} dot={false} />
          <ScoreRow scoreboard={scoreboard} />
          <div className="lv-fin-thanks a-rise" style={delay(0.2)}>{field("signoff")}</div>
          <div className="lv-fin-panel a-wipe" style={delay(0.2)}>
            <span><small>Instagram · YouTube</small>@infocusnews</span>
            <span><small>TikTok · X</small>@palyinfocus</span>
            <span><small>Web</small>infocusnews.tv</span>
          </div>
        </div>
      );
    default:
      return null;
  }
}
