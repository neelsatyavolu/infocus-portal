import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FOOTBALL_TIMEOUTS_PER_HALF,
  MAX_TEAM_NAME,
  clockMs,
  flagOn,
  formatClock,
  ordinalDown,
  parseClockInput,
  periodLabel,
  timeoutShowing,
  type ScoreboardAction,
  type ScoreboardState,
  type Sport,
  type TeamIndex
} from "@/src/lib/live/scoreboard";
import { FieldLabel, Seg, TapToEdit, Toggle } from "./live-controls";

type Dispatch = (action: ScoreboardAction) => void;
type CardProps = { scoreboard: ScoreboardState; dispatch: Dispatch; now: number };

const SCORE_BUTTONS: Record<Sport, Array<{ points: number; hint?: string }>> = {
  basketball: [{ points: 1, hint: "Free throw" }, { points: 2 }, { points: 3 }],
  football: [{ points: 6, hint: "TD" }, { points: 3, hint: "FG" }, { points: 2, hint: "2PT / safety" }, { points: 1, hint: "PAT" }],
  volleyball: [{ points: 1, hint: "Point" }],
  other: [{ points: 1 }, { points: 2 }, { points: 3 }]
};

const card = "grid content-start gap-4 rounded-md border border-border bg-card p-4";
const cardTitle = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

function parseScore(text: string) {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 0 && value <= 999 ? value : null;
}

function TimeoutPips({ left }: { left: number }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {Array.from({ length: FOOTBALL_TIMEOUTS_PER_HALF }, (_, index) => (
        <span key={index} className={`h-1.5 w-5 rounded-sm ${index < left ? "bg-foreground" : "bg-border"}`} />
      ))}
    </span>
  );
}

export function TeamCard({ scoreboard, dispatch, now, team }: CardProps & { team: TeamIndex }) {
  const data = scoreboard.teams[team];
  const sport = scoreboard.sport;
  const side = team === 0 ? "Home" : "Away";
  const timeoutTagOn = timeoutShowing(scoreboard, team, now);

  return (
    <section className={card} aria-label={`${side} team`}>
      <div className="flex items-center justify-between gap-3">
        <span className={cardTitle}>{side}</span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Color
          <input
            type="color"
            id={`live-team-color-${team}`}
            value={data.color}
            onChange={(event) => dispatch({ type: "team", team, color: event.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Input
          id={`live-team-name-${team}`}
          aria-label={`${side} team name`}
          value={data.name}
          maxLength={MAX_TEAM_NAME}
          placeholder={side.toUpperCase()}
          onChange={(event) => dispatch({ type: "team", team, name: event.target.value })}
          className="h-11 flex-1 text-base font-semibold uppercase tracking-wide"
        />
        <TapToEdit
          label={`${side} score`}
          initial={String(data.score)}
          parse={parseScore}
          onCommit={(score) => dispatch({ type: "scoreSet", team, score })}
          display={<span className="block min-w-[3ch] px-2 text-right font-mono-broadcast text-5xl font-medium tabular-nums leading-none">{data.score}</span>}
          inputClassName="h-14 w-24 text-right font-mono-broadcast text-4xl tabular-nums"
        />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-2">
        {SCORE_BUTTONS[sport].map(({ points, hint }) => (
          <Button
            key={points}
            type="button"
            onClick={() => dispatch({ type: "score", team, delta: points })}
            className="h-14 flex-col gap-0 text-xl font-semibold"
          >
            +{points}
            {hint ? <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">{hint}</span> : null}
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "score", team, delta: -1 })} className="h-14 text-xl">
          −1
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sport === "football" ? (
          <>
            <Toggle pressed={scoreboard.possession === team} onClick={() => dispatch({ type: "possession", team })}>
              {scoreboard.possession === team ? "Has the ball" : "Give ball"}
            </Toggle>
            <div className="flex items-center gap-1 rounded-md border border-input pl-3">
              <span className="mr-1 text-sm">Timeouts</span>
              <TimeoutPips left={data.timeouts} />
              <Button type="button" size="sm" variant="ghost" aria-label={`Give ${side} a timeout back`} onClick={() => dispatch({ type: "timeoutAdjust", team, delta: 1 })} disabled={data.timeouts >= FOOTBALL_TIMEOUTS_PER_HALF}>
                +
              </Button>
            </div>
            <Button type="button" variant="outline" className="h-11" onClick={() => dispatch({ type: "timeout", team })} disabled={data.timeouts === 0 && !timeoutTagOn}>
              {timeoutTagOn ? "End timeout" : "Call timeout"}
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" className="h-11" onClick={() => dispatch({ type: "timeout", team })}>
            {timeoutTagOn ? "End timeout" : "Call timeout"}
          </Button>
        )}
        {sport === "basketball" ? (
          <Toggle pressed={data.bonus} onClick={() => dispatch({ type: "bonus", team })}>
            {data.bonus ? "In the bonus" : "Bonus"}
          </Toggle>
        ) : null}
        {sport === "volleyball" ? (
          <Toggle pressed={scoreboard.serve === team} onClick={() => dispatch({ type: "serve", team })}>
            {scoreboard.serve === team ? "Serving" : "Serve"}
          </Toggle>
        ) : null}
      </div>
    </section>
  );
}

const NUDGES = [-10_000, -1_000, 1_000, 10_000];

export function ClockCard({ scoreboard, dispatch, now }: CardProps) {
  const sport = scoreboard.sport;
  const running = scoreboard.clock.running;
  const ms = clockMs(scoreboard.clock, now);
  const other = sport === "other";

  return (
    <section className={card} aria-label="Clock">
      <div className="flex items-center justify-between gap-3">
        <span className={cardTitle}>{other ? "Period and clock" : "Quarter and clock"}</span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Show on stream
          <Switch checked={scoreboard.showClock} onCheckedChange={(show) => dispatch({ type: "showClock", show })} aria-label="Show the clock on stream" />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        {other ? (
          <Input
            id="live-period-label"
            aria-label="Period"
            value={scoreboard.periodLabel}
            maxLength={24}
            placeholder="2nd half"
            onChange={(event) => dispatch({ type: "periodLabel", value: event.target.value })}
            className="h-11 w-36 text-base font-semibold"
          />
        ) : (
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Previous quarter" onClick={() => dispatch({ type: "previousPeriod" })} disabled={scoreboard.period <= 1}>
              ‹
            </Button>
            <span className="min-w-[3.5rem] text-center text-2xl font-semibold">{periodLabel(scoreboard)}</span>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Next quarter" onClick={() => dispatch({ type: "nextPeriod" })}>
              ›
            </Button>
          </div>
        )}
        <TapToEdit
          label="Clock"
          initial={formatClock(ms, sport).replace(/^(\d+)\.(\d)$/, "0:$1.$2")}
          parse={parseClockInput}
          onCommit={(value) => dispatch({ type: "clockSet", ms: value })}
          display={
            <span className={`block px-2 font-mono-broadcast text-6xl font-medium tabular-nums leading-none ${running ? "text-foreground" : "text-[var(--ink-text)]"}`}>
              {formatClock(ms, sport)}
            </span>
          }
          inputClassName="h-16 w-40 text-center font-mono-broadcast text-4xl tabular-nums"
          inputMode="text"
        />
      </div>

      <Button
        type="button"
        variant={running ? "secondary" : "default"}
        onClick={() => dispatch({ type: "clockToggle" })}
        className="h-14 text-lg font-semibold"
        disabled={!running && scoreboard.clock.direction === "down" && ms <= 0}
      >
        {running ? "Stop clock" : "Start clock"}
        <kbd className="ml-2 rounded border border-current/30 px-1.5 text-[11px] font-medium opacity-70">Space</kbd>
      </Button>

      <div className="grid grid-cols-4 gap-2">
        {NUDGES.map((delta) => (
          <Button key={delta} type="button" variant="outline" className="h-11 font-mono-broadcast tabular-nums" onClick={() => dispatch({ type: "clockAdjust", deltaMs: delta })}>
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta) / 1000}s
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="outline" className="h-11" onClick={() => dispatch({ type: "clockReset" })}>
          Reset clock
        </Button>
        {other ? (
          <>
            <Seg
              label="Clock direction"
              value={scoreboard.clock.direction}
              options={[
                { value: "up", label: "Counts up" },
                { value: "down", label: "Counts down" }
              ]}
              onChange={(direction) => dispatch({ type: "clockDirection", direction })}
            />
            {scoreboard.clock.direction === "down" ? (
              <FieldLabel label="Period length (min)">
                <Input
                  id="live-period-length"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={Math.round(scoreboard.clock.resetMs / 60_000) || ""}
                  placeholder="40"
                  className="h-11 w-24"
                  onBlur={(event) => event.currentTarget.value && dispatch({ type: "periodLength", minutes: Number(event.currentTarget.value) })}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                />
              </FieldLabel>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Tap the clock to type a time, like 4:32 or 45.5.</p>
    </section>
  );
}

const QUICK_DISTANCE = ["10", "Goal", "Inches"];

export function FootballCard({ scoreboard, dispatch, now }: CardProps) {
  const flag = flagOn(scoreboard, now);
  return (
    <section className={card} aria-label="Down and distance">
      <span className={cardTitle}>Down and distance</span>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((down) => (
          <Toggle key={down} pressed={scoreboard.down === down} onClick={() => dispatch({ type: "down", down: scoreboard.down === down ? 0 : down })} className="h-12 text-base">
            {ordinalDown(down)}
          </Toggle>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <FieldLabel label="To go">
          <Input
            id="live-distance"
            className="h-11 w-24 text-base"
            value={scoreboard.distance}
            maxLength={6}
            onChange={(event) => dispatch({ type: "distance", value: event.target.value })}
          />
        </FieldLabel>
        {QUICK_DISTANCE.map((value) => (
          <Button key={value} type="button" variant="outline" className="h-11" onClick={() => dispatch({ type: "distance", value })}>
            {value}
          </Button>
        ))}
        <Button type="button" variant="ghost" className="h-11" onClick={() => dispatch({ type: "down", down: 0 })} disabled={!scoreboard.down}>
          Hide down
        </Button>
      </div>
      <Toggle pressed={flag} tone="amber" onClick={() => dispatch({ type: "flag" })} className="h-12 text-base">
        {flag ? "Flag on the field · tap to pick up" : "Throw flag"}
      </Toggle>
      <label className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2.5 text-sm">
        <span>
          Touchdown animation
          <span className="block text-xs text-muted-foreground">Plays on +6. Tap −1 right after to cancel it.</span>
        </span>
        <Switch
          checked={scoreboard.celebrations}
          onCheckedChange={(on) => dispatch({ type: "celebrations", on })}
          aria-label="Play the touchdown animation on +6"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        The down shows above the team with the ball. A flag turns it yellow until you pick it up, set a new down, or someone scores.
      </p>
    </section>
  );
}

export function VolleyballCard({ scoreboard, dispatch }: Omit<CardProps, "now">) {
  return (
    <section className={card} aria-label="Set">
      <span className={cardTitle}>Set</span>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-4xl font-semibold">Set {scoreboard.set}</span>
        <span className="flex gap-3 text-2xl font-semibold">
          <span>{scoreboard.teams[0].name || "HOME"} {scoreboard.teams[0].sets}</span>
          <span className="text-muted-foreground">–</span>
          <span>{scoreboard.teams[1].sets} {scoreboard.teams[1].name || "AWAY"}</span>
        </span>
      </div>
      <Button type="button" onClick={() => dispatch({ type: "endSet" })} className="h-14 text-lg font-semibold">
        End set {scoreboard.set}
      </Button>
      {scoreboard.setHistory.length ? (
        <p className="font-mono-broadcast text-sm tabular-nums text-muted-foreground">
          {scoreboard.setHistory.map(([home, away], index) => `Set ${index + 1}: ${home}–${away}`).join("   ")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">End set gives the set to whoever is ahead, adds it to sets won, and resets points to 0–0.</p>
      )}
    </section>
  );
}

export function OtherNoteCard({ scoreboard, dispatch }: Omit<CardProps, "now">) {
  return (
    <section className={card} aria-label="Strip note">
      <span className={cardTitle}>Note on the green strip</span>
      <Input
        id="live-note"
        value={scoreboard.note}
        maxLength={60}
        placeholder="Varsity boys soccer · Viking Stadium"
        onChange={(event) => dispatch({ type: "note", value: event.target.value })}
        className="h-11 text-base"
      />
    </section>
  );
}
