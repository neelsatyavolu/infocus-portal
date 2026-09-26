import { LiveStage, useLiveNow } from "@/components/live/live-stage";
import { Scorebug } from "@/components/live/scorebug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SPORTS,
  SPORT_LABELS,
  clockMs,
  formatClock,
  ordinalDown,
  periodLabel,
  type ScoreboardAction,
  type ScoreboardState,
  type Sport,
  type TeamIndex
} from "@/src/lib/live/scoreboard";
import { CopyUrl, FieldLabel, Panel, Seg } from "./live-controls";

type Props = {
  scoreboard: ScoreboardState;
  dispatch: (action: ScoreboardAction) => void;
  offset: number;
  overlayUrl: string;
};

const SCORE_BUTTONS: Record<Sport, number[]> = {
  basketball: [1, 2, 3],
  football: [6, 1, 2, 3],
  volleyball: [1],
  other: [1, 2, 3]
};

const SPORT_OPTIONS = SPORTS.map((sport) => ({ value: sport, label: SPORT_LABELS[sport] }));
const POSITION_OPTIONS = [
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" }
] as const;

function TeamCard({ scoreboard, team, dispatch }: { scoreboard: ScoreboardState; team: TeamIndex; dispatch: Props["dispatch"] }) {
  const data = scoreboard.teams[team];
  const sport = scoreboard.sport;
  return (
    <div className="grid gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={`live-team-color-${team}`}
          aria-label={`${team === 0 ? "Home" : "Away"} team color`}
          value={data.color}
          onChange={(event) => dispatch({ type: "team", team, color: event.target.value })}
          className="h-9 w-9 shrink-0 rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          id={`live-team-name-${team}`}
          aria-label={`${team === 0 ? "Home" : "Away"} team short name`}
          value={data.name}
          maxLength={8}
          onChange={(event) => dispatch({ type: "team", team, name: event.target.value })}
        />
        <span className="min-w-14 text-right font-mono-broadcast text-3xl tabular-nums">{data.score}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {SCORE_BUTTONS[sport].map((points) => (
          <Button key={points} type="button" size="sm" className="min-w-11 font-mono-broadcast" onClick={() => dispatch({ type: "score", team, delta: points })}>
            +{points}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" className="min-w-11 font-mono-broadcast" onClick={() => dispatch({ type: "score", team, delta: -1 })}>
          −1
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "timeout", team })} disabled={sport === "football" && data.timeouts === 0}>
          {sport === "football" ? `Timeout (${data.timeouts} left)` : "Timeout"}
        </Button>
        {sport === "basketball" ? (
          <Button type="button" size="sm" variant="outline" aria-pressed={data.bonus} onClick={() => dispatch({ type: "bonus", team })}>
            {data.bonus ? "Bonus on" : "Bonus off"}
          </Button>
        ) : null}
        {sport === "volleyball" ? (
          <Button type="button" size="sm" variant="outline" aria-pressed={scoreboard.serve === team} onClick={() => dispatch({ type: "serve", team })}>
            {scoreboard.serve === team ? "● Serving" : "Serve"}
          </Button>
        ) : null}
        {sport === "football" ? (
          <Button type="button" size="sm" variant="outline" aria-pressed={scoreboard.possession === team} onClick={() => dispatch({ type: "possession", team })}>
            {scoreboard.possession === team ? "● Has ball" : "Possession"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ClockControls({ scoreboard, dispatch, now }: { scoreboard: ScoreboardState; dispatch: Props["dispatch"]; now: number }) {
  const sport = scoreboard.sport;
  const running = scoreboard.clock.running;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-24 text-sm text-muted-foreground">
        {periodLabel(scoreboard)} · <span className="font-mono-broadcast tabular-nums text-foreground">{formatClock(clockMs(scoreboard.clock, now), sport)}</span>
      </span>
      <Button type="button" size="sm" onClick={() => dispatch({ type: "clockToggle" })}>
        {running ? "Stop clock" : "Start clock"}
      </Button>
      {sport !== "other" ? (
        <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "nextPeriod" })}>
          Next quarter
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "clockReset" })}>
        Reset clock
      </Button>
      <Button type="button" size="sm" variant="outline" aria-pressed={scoreboard.showClock} onClick={() => dispatch({ type: "showClock", show: !scoreboard.showClock })}>
        {scoreboard.showClock ? "Hide clock" : "Show clock"}
      </Button>
    </div>
  );
}

function SportControls({ scoreboard, dispatch }: { scoreboard: ScoreboardState; dispatch: Props["dispatch"] }) {
  if (scoreboard.sport === "football") {
    return (
      <div className="flex flex-wrap items-end gap-2">
        {[1, 2, 3, 4].map((down) => (
          <Button key={down} type="button" size="sm" variant="outline" aria-pressed={scoreboard.down === down} className="aria-pressed:border-[var(--brand-green)]" onClick={() => dispatch({ type: "down", down })}>
            {ordinalDown(down)}
          </Button>
        ))}
        <FieldLabel label="To go">
          <Input id="live-distance" className="w-20" value={scoreboard.distance} maxLength={5} onChange={(event) => dispatch({ type: "distance", value: event.target.value })} />
        </FieldLabel>
        <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "down", down: 0 })}>
          Clear down
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "flag" })}>
          Flag
        </Button>
      </div>
    );
  }
  if (scoreboard.sport === "volleyball") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-24 text-sm text-muted-foreground">Set {scoreboard.set}</span>
        <Button type="button" size="sm" onClick={() => dispatch({ type: "endSet" })}>
          End set
        </Button>
        {scoreboard.setHistory.length ? (
          <span className="font-mono-broadcast text-sm tabular-nums text-muted-foreground">
            {scoreboard.setHistory.map(([home, away]) => `${home}–${away}`).join("  ")}
          </span>
        ) : null}
      </div>
    );
  }
  if (scoreboard.sport === "other") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Period">
          <Input id="live-period-label" value={scoreboard.periodLabel} maxLength={24} placeholder="2nd half" onChange={(event) => dispatch({ type: "periodLabel", value: event.target.value })} />
        </FieldLabel>
        <FieldLabel label="Note on the strip">
          <Input id="live-note" value={scoreboard.note} maxLength={60} placeholder="Varsity boys soccer · Viking Stadium" onChange={(event) => dispatch({ type: "note", value: event.target.value })} />
        </FieldLabel>
        <div className="flex flex-wrap items-end gap-2">
          <Seg
            label="Clock direction"
            value={scoreboard.clock.direction}
            options={[
              { value: "up", label: "Counts up" },
              { value: "down", label: "Counts down" }
            ]}
            onChange={(direction) => dispatch({ type: "clockDirection", direction })}
          />
        </div>
        <FieldLabel label="Set clock to (minutes)">
          <Input
            id="live-clock-minutes"
            type="number"
            min={0}
            max={120}
            placeholder="40"
            onKeyDown={(event) => {
              if (event.key === "Enter") dispatch({ type: "clockSetMinutes", minutes: Number(event.currentTarget.value) || 0 });
            }}
            onBlur={(event) => event.currentTarget.value && dispatch({ type: "clockSetMinutes", minutes: Number(event.currentTarget.value) || 0 })}
          />
        </FieldLabel>
      </div>
    );
  }
  return null;
}

export function ScoreboardPanel({ scoreboard, dispatch, offset, overlayUrl }: Props) {
  const now = useLiveNow(offset);

  function changeSport(sport: Sport) {
    if (sport === scoreboard.sport) return;
    if (!window.confirm(`Switch to ${SPORT_LABELS[sport]}? This clears the score and clock. Team names and colors stay.`)) return;
    dispatch({ type: "sport", sport });
  }

  function resetBoard() {
    if (!window.confirm("Reset the scoreboard to 0–0? Team names and colors stay.")) return;
    dispatch({ type: "reset" });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
      <Panel title="Scoreboard · OBS source 1" action={<Seg label="Sport" value={scoreboard.sport} options={SPORT_OPTIONS} onChange={changeSport} />}>
        <LiveStage background="checker" className="rounded-md">
          <div className="lv-play">
            <Scorebug state={scoreboard} now={now} />
          </div>
        </LiveStage>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Seg label="Position" value={scoreboard.position} options={POSITION_OPTIONS} onChange={(position) => dispatch({ type: "position", position })} />
          <Button type="button" size="sm" variant="destructive-quiet" onClick={resetBoard}>
            Reset scoreboard
          </Button>
        </div>
        <CopyUrl label="OBS Browser Source" url={overlayUrl} hint="Add as a Browser Source, 1920 × 1080. The background is transparent." />
      </Panel>

      <Panel title="Controls">
        <div className="grid gap-3">
          <TeamCard scoreboard={scoreboard} team={0} dispatch={dispatch} />
          <TeamCard scoreboard={scoreboard} team={1} dispatch={dispatch} />
        </div>
        {scoreboard.sport !== "volleyball" ? <ClockControls scoreboard={scoreboard} dispatch={dispatch} now={now} /> : null}
        <SportControls scoreboard={scoreboard} dispatch={dispatch} />
      </Panel>
    </div>
  );
}
