import type { ReactNode } from "react";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FOOTBALL_TIMEOUTS_PER_HALF,
  MAX_TEAM_NAME,
  activeTags,
  flagOn,
  ordinalDown,
  timeoutShowing,
  type ScoreboardAction,
  type ScoreboardState,
  type Sport,
  type TeamIndex
} from "@/src/lib/live/scoreboard";
import { cn } from "@/src/lib/utils";
import { KEY_CLASS, TapToEdit, ToggleChip } from "./live-controls";
import { downTag } from "./live-status";

export { ClockCard } from "./scoreboard-clock";

type Dispatch = (action: ScoreboardAction) => void;
type CardProps = { scoreboard: ScoreboardState; dispatch: Dispatch; now: number };

const SCORE_BUTTONS: Record<Sport, Array<{ points: number; hint?: string }>> = {
  basketball: [{ points: 1, hint: "Free throw" }, { points: 2 }, { points: 3 }],
  football: [{ points: 6, hint: "TD" }, { points: 3, hint: "FG" }, { points: 2, hint: "2PT / safety" }, { points: 1, hint: "PAT" }],
  volleyball: [{ points: 1, hint: "Point" }],
  other: [{ points: 1 }, { points: 2 }, { points: 3 }]
};

/** One column per key, including −1, so both teams' keypads line up. */
const KEYPAD_COLUMNS: Record<Sport, string> = {
  basketball: "grid-cols-4",
  football: "grid-cols-5",
  volleyball: "grid-cols-2",
  other: "grid-cols-4"
};

/** The team's toggle row shares the card's width in equal columns; long labels wrap to two lines instead of spilling. */
const ROW_BUTTON = "whitespace-normal px-2 text-center leading-tight";

function parseScore(text: string) {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 0 && value <= 999 ? value : null;
}

/** Football timeouts left, as a status mark (not a control): "TO ▮▮▯". */
function TimeoutPips({ left }: { left: number }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5" role="img" aria-label={`${left} timeouts left`}>
      <span aria-hidden className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        TO
      </span>
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: FOOTBALL_TIMEOUTS_PER_HALF }, (_, index) => (
          <span key={index} className={cn("h-1.5 w-4 rounded-sm", index < left ? "bg-foreground" : "bg-[var(--ink-4)]")} />
        ))}
      </span>
    </span>
  );
}

function TeamTags({ scoreboard, team, timeoutOn }: { scoreboard: ScoreboardState; team: TeamIndex; timeoutOn: boolean }) {
  const data = scoreboard.teams[team];
  const sport = scoreboard.sport;
  return (
    <>
      {sport === "football" && scoreboard.possession === team ? <StatusTag tone="success">Ball</StatusTag> : null}
      {sport === "basketball" && data.bonus ? <StatusTag tone="success">Bonus</StatusTag> : null}
      {sport === "volleyball" && scoreboard.serve === team ? <StatusTag tone="success">Serving</StatusTag> : null}
      {timeoutOn ? <StatusTag tone="warning">Timeout</StatusTag> : null}
      {sport === "football" ? <TimeoutPips left={data.timeouts} /> : null}
    </>
  );
}

export function TeamCard({ scoreboard, dispatch, now, team }: CardProps & { team: TeamIndex }) {
  const data = scoreboard.teams[team];
  const sport = scoreboard.sport;
  const side = team === 0 ? "Home" : "Away";
  const timeoutTagOn = timeoutShowing(scoreboard, team, now);

  return (
    <Panel
      padding="md"
      aria-label={`${side} team`}
      title={side}
      status={<TeamTags scoreboard={scoreboard} team={team} timeoutOn={timeoutTagOn} />}
    >
      <div className="grid gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="color"
            id={`live-team-color-${team}`}
            aria-label={`${side} color`}
            title="Team color"
            value={data.color}
            onChange={(event) => dispatch({ type: "team", team, color: event.target.value })}
            className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
          />
          <Input
            id={`live-team-name-${team}`}
            aria-label={`${side} team name`}
            value={data.name}
            maxLength={MAX_TEAM_NAME}
            placeholder={side.toUpperCase()}
            onChange={(event) => dispatch({ type: "team", team, name: event.target.value })}
            className="h-11 min-w-0 flex-1 text-base font-semibold uppercase tracking-wide md:text-base"
          />
          <TapToEdit
            label={`${side} score`}
            initial={String(data.score)}
            parse={parseScore}
            onCommit={(score) => dispatch({ type: "scoreSet", team, score })}
            display={data.score}
            className="h-14 min-w-[calc(3ch+1.25rem)] shrink-0 justify-end text-5xl"
            inputClassName="h-14 w-[calc(3ch+1.25rem)] shrink-0 text-right text-5xl"
          />
        </div>

        <div className={cn("grid gap-2", KEYPAD_COLUMNS[sport])}>
          {SCORE_BUTTONS[sport].map(({ points, hint }) => (
            <Button
              key={points}
              type="button"
              onClick={() => dispatch({ type: "score", team, delta: points })}
              className={cn("h-14 min-w-0 flex-col gap-0.5 px-0.5 py-0 text-xl font-semibold leading-none", KEY_CLASS)}
            >
              +{points}
              {hint ? (
                <span className="whitespace-normal text-center text-[11px] font-medium uppercase leading-tight text-muted-foreground">
                  {hint}
                </span>
              ) : null}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => dispatch({ type: "score", team, delta: -1 })}
            className="h-14 min-w-0 px-1 text-xl font-semibold"
          >
            −1
          </Button>
        </div>

        <div className="grid auto-cols-fr grid-flow-col gap-2">
          {sport === "football" ? (
            <ToggleChip pressed={scoreboard.possession === team} onClick={() => dispatch({ type: "possession", team })} className={ROW_BUTTON}>
              Give ball
            </ToggleChip>
          ) : null}
          {sport === "basketball" ? (
            <ToggleChip pressed={data.bonus} onClick={() => dispatch({ type: "bonus", team })} className={ROW_BUTTON}>
              Bonus
            </ToggleChip>
          ) : null}
          {sport === "volleyball" ? (
            <ToggleChip pressed={scoreboard.serve === team} onClick={() => dispatch({ type: "serve", team })} className={ROW_BUTTON}>
              Serve
            </ToggleChip>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className={cn("h-11 min-w-0", ROW_BUTTON)}
            onClick={() => dispatch({ type: "timeout", team })}
            disabled={sport === "football" && data.timeouts === 0 && !timeoutTagOn}
          >
            {timeoutTagOn ? "End timeout" : "Call timeout"}
          </Button>
          {sport === "football" ? (
            <Button
              type="button"
              variant="outline"
              className={cn("h-11 min-w-0", ROW_BUTTON)}
              aria-label={`Give ${side} a timeout back (+1 timeout)`}
              onClick={() => dispatch({ type: "timeoutAdjust", team, delta: 1 })}
              disabled={data.timeouts >= FOOTBALL_TIMEOUTS_PER_HALF}
            >
              +1 timeout
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

const QUICK_DISTANCE = ["10", "Goal", "Inches"];
const FOOTBALL_HINT =
  "The down shows above the team with the ball. A flag turns it yellow until you pick it up, set a new down, or someone scores.";

export function FootballCard({ scoreboard, dispatch, now }: CardProps) {
  const flag = flagOn(scoreboard, now);
  const down = downTag(scoreboard);

  return (
    <Panel
      padding="md"
      aria-label="Down and distance"
      title="Down and distance"
      status={
        <>
          {down ? <StatusTag>{down}</StatusTag> : null}
          {flag ? <StatusTag tone="warning">Flag</StatusTag> : null}
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-2 lg:grid-cols-2">
          <div role="group" aria-label="Down" className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((value) => (
              <ToggleChip
                key={value}
                pressed={scoreboard.down === value}
                onClick={() => dispatch({ type: "down", down: scoreboard.down === value ? 0 : value })}
                className="px-1"
              >
                {ordinalDown(value)}
              </ToggleChip>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <label className="relative block min-w-0">
              <span className="pointer-events-none absolute left-2 top-1 text-[11px] font-medium uppercase leading-none tracking-[0.11em] text-muted-foreground">
                To go
              </span>
              <Input
                id="live-distance"
                className="h-11 px-2 pb-1 pt-4 text-base md:text-base"
                value={scoreboard.distance}
                maxLength={6}
                onChange={(event) => dispatch({ type: "distance", value: event.target.value })}
              />
            </label>
            {QUICK_DISTANCE.map((value) => (
              <Button key={value} type="button" variant="outline" className="h-11 min-w-0 px-1" onClick={() => dispatch({ type: "distance", value })}>
                {value}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => dispatch({ type: "down", down: 0 })} disabled={!scoreboard.down}>
            Hide down
          </Button>
          <ToggleChip pressed={flag} tone="amber" onClick={() => dispatch({ type: "flag" })}>
            Flag
          </ToggleChip>
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">{FOOTBALL_HINT}</p>
        <label className="flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium text-foreground">Touchdown animation</span>
            <span className="block text-[13px] leading-snug text-muted-foreground">Plays on +6. Tap −1 right after to cancel it.</span>
          </span>
          <Switch
            checked={scoreboard.celebrations}
            onCheckedChange={(on) => dispatch({ type: "celebrations", on })}
            aria-label="Play the touchdown animation on +6"
          />
        </label>
      </div>
    </Panel>
  );
}

/**
 * Volleyball's transport card: the set, sets won, and End set (the one primary on its tab).
 * `notice` (a save problem in full words) takes the End set hint's place.
 */
export function VolleyballCard({ scoreboard, dispatch, now, notice }: CardProps & { notice?: ReactNode }) {
  const setResult = activeTags(scoreboard, now, "set")[0];
  const [home, away] = scoreboard.teams;
  return (
    <Panel
      padding="md"
      aria-label="Set"
      title="Set"
      status={setResult ? <StatusTag tone="success">{setResult.text}</StatusTag> : null}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span className="text-4xl font-semibold tracking-tight">Set {scoreboard.set}</span>
          <span className="flex min-w-0 items-baseline justify-end gap-2 text-2xl font-semibold md:justify-center">
            <span className="sr-only">Sets won:</span>
            <span className="min-w-0 truncate">{home.name || "HOME"}</span>
            <span className="font-mono-broadcast font-medium tabular-nums">{home.sets}</span>
            <span className="text-muted-foreground">–</span>
            <span className="font-mono-broadcast font-medium tabular-nums">{away.sets}</span>
            <span className="min-w-0 truncate">{away.name || "AWAY"}</span>
          </span>
          <Button type="button" onClick={() => dispatch({ type: "endSet" })} className="col-span-2 h-14 text-base font-semibold md:col-span-1 md:w-40">
            End set {scoreboard.set}
          </Button>
        </div>
        {scoreboard.setHistory.length ? (
          <p className="font-mono-broadcast text-sm tabular-nums text-[var(--ink-text)]">
            {scoreboard.setHistory.map(([homePoints, awayPoints], index) => `Set ${index + 1}: ${homePoints}–${awayPoints}`).join("   ")}
          </p>
        ) : null}
        {notice ??
          (scoreboard.setHistory.length ? null : (
            <p className="text-[13px] leading-snug text-muted-foreground">
              End set gives the set to whoever is ahead, adds it to sets won, and resets points to 0–0.
            </p>
          ))}
      </div>
    </Panel>
  );
}

export function OtherNoteCard({ scoreboard, dispatch, className }: Omit<CardProps, "now"> & { className?: string }) {
  return (
    <Panel padding="md" aria-label="Strip note" title="Note on the green strip" className={className}>
      <Input
        id="live-note"
        aria-label="Note on the green strip"
        value={scoreboard.note}
        maxLength={60}
        placeholder="Varsity boys soccer · Viking Stadium"
        onChange={(event) => dispatch({ type: "note", value: event.target.value })}
        className="h-11 text-base md:text-base"
      />
    </Panel>
  );
}
