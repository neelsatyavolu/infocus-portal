import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Kbd } from "@/components/kit/kbd";
import { Panel } from "@/components/kit/panel";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  clockMs,
  formatClock,
  parseClockInput,
  periodLabel,
  type ScoreboardAction,
  type ScoreboardState
} from "@/src/lib/live/scoreboard";
import { cn } from "@/src/lib/utils";
import { ActionDock, KEY_CLASS, TapToEdit } from "./live-controls";
import { gameReadout } from "./live-status";

type CardProps = { scoreboard: ScoreboardState; dispatch: (action: ScoreboardAction) => void; now: number };

const NUDGES = [-10_000, -1_000, 1_000, 10_000];
const DIRECTION_OPTIONS: Array<{ value: "up" | "down"; label: string }> = [
  { value: "up", label: "Counts up" },
  { value: "down", label: "Counts down" }
];
const CLOCK_HINT = "Tap the clock to type a time, like 4:32 or 45.5.";
/** The big clock and its edit field share one size, so tapping it doesn't move the row. Smaller on narrow phones so 12:00 fits beside the stepper. */
const CLOCK_TEXT = "h-14 text-[2rem] min-[360px]:text-[2.5rem] sm:text-5xl md:h-[4.5rem] md:text-7xl";

function PeriodStepper({ scoreboard, dispatch }: Omit<CardProps, "now">) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-14 w-10 sm:w-11"
        aria-label="Previous quarter"
        onClick={() => dispatch({ type: "previousPeriod" })}
        disabled={scoreboard.period <= 1}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-10 text-center text-2xl font-semibold sm:min-w-12">{periodLabel(scoreboard)}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-14 w-10 sm:w-11"
        aria-label="Next quarter"
        onClick={() => dispatch({ type: "nextPeriod" })}
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

/**
 * The phone clock bar's readout. The time always shows; the score is cut short first, then a long
 * period label (Other sport's free text).
 */
function GameReadout({ scoreboard, now }: Omit<CardProps, "dispatch">) {
  const { period, time, score } = gameReadout(scoreboard, now);
  return (
    <span className="flex min-w-0 items-baseline gap-2 font-mono-broadcast text-sm font-medium tabular-nums">
      <span className="flex min-w-0 items-baseline gap-1.5 text-foreground">
        {period ? <span className="min-w-0 truncate">{period}</span> : null}
        <span className="shrink-0">{time}</span>
      </span>
      <span className="min-w-0 shrink-100 truncate text-[var(--ink-text)]">{score}</span>
    </span>
  );
}

/**
 * The transport: period, the big clock and Start/Stop on one row, then the nudges and Reset.
 * On phones Start/Stop (with the clock and score beside it) is fixed above the tab bar, so it stays
 * in reach while scoring either team. `dockStatus` (a save or sync problem) takes the readout's
 * place there, so it stays on screen while scoring. `notice` (the save problem in full words)
 * takes the hint's place, so nothing below it moves.
 */
export function ClockCard({
  scoreboard,
  dispatch,
  now,
  dockStatus,
  notice
}: CardProps & { dockStatus?: ReactNode; notice?: ReactNode }) {
  const sport = scoreboard.sport;
  const running = scoreboard.clock.running;
  const ms = clockMs(scoreboard.clock, now);
  const other = sport === "other";
  const countingDown = scoreboard.clock.direction === "down";

  return (
    <Panel
      padding="md"
      aria-label="Clock"
      title={other ? "Period and clock" : "Quarter and clock"}
      status={
        <>
          {running ? <StatusTag tone="success">Running</StatusTag> : <StatusTag>Stopped</StatusTag>}
          {scoreboard.showClock ? null : <StatusTag tone="muted">Clock hidden</StatusTag>}
        </>
      }
      actions={
        // A 40px target on phones; the negative margin keeps the header row at 32px.
        <label className="flex items-center gap-3 text-sm font-medium text-foreground max-md:-my-1 max-md:h-10!">
          Show on stream
          <Switch
            checked={scoreboard.showClock}
            onCheckedChange={(show) => dispatch({ type: "showClock", show })}
            aria-label="Show the clock on stream"
          />
        </label>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          {other ? (
            <Input
              id="live-period-label"
              aria-label="Period"
              value={scoreboard.periodLabel}
              maxLength={24}
              placeholder="2nd half"
              onChange={(event) => dispatch({ type: "periodLabel", value: event.target.value })}
              className="h-14 w-32 text-lg font-semibold md:w-40 md:text-lg"
            />
          ) : (
            <PeriodStepper scoreboard={scoreboard} dispatch={dispatch} />
          )}
          <TapToEdit
            label="Clock"
            initial={formatClock(ms, sport).replace(/^(\d+)\.(\d)$/, "0:$1.$2")}
            parse={parseClockInput}
            onCommit={(value) => dispatch({ type: "clockSet", ms: value })}
            display={<span className={running ? "text-foreground" : "text-[var(--ink-text)]"}>{formatClock(ms, sport)}</span>}
            className={cn("justify-self-center", CLOCK_TEXT)}
            inputClassName={cn("w-full max-w-[calc(5ch+1.25rem)] justify-self-center text-center", CLOCK_TEXT)}
            inputMode="text"
            title="Tap to type a time, like 4:32 or 45.5"
          />
          <ActionDock
            aria-label="Clock control"
            leading={dockStatus ?? <GameReadout scoreboard={scoreboard} now={now} />}
          >
            <Button
              type="button"
              onClick={() => dispatch({ type: "clockToggle" })}
              className={cn("h-11 w-36 shrink-0 text-base font-semibold md:h-14 md:w-40", running && KEY_CLASS)}
              disabled={!running && countingDown && ms <= 0}
            >
              {running ? "Stop clock" : "Start clock"}
              <Kbd className="hidden border-current/30 bg-transparent px-1.5 text-current opacity-70 md:inline-flex">Space</Kbd>
            </Button>
          </ActionDock>
        </div>

        {/* Phones: nudges, then (Other) direction, period length and Reset, then the hint.
            From md one wrapping row, with the hint between the nudges and Reset. */}
        <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap md:items-center">
          {NUDGES.map((delta) => (
            <Button
              key={delta}
              type="button"
              variant="outline"
              className="h-11 min-w-0 px-1 tabular-nums md:w-16"
              onClick={() => dispatch({ type: "clockAdjust", deltaMs: delta })}
            >
              {delta > 0 ? "+" : "−"}
              {Math.abs(delta) / 1000}s
            </Button>
          ))}
          {other ? (
            <>
              <SegmentedControl
                ariaLabel="Clock direction"
                value={scoreboard.clock.direction}
                options={DIRECTION_OPTIONS}
                onChange={(direction) => dispatch({ type: "clockDirection", direction })}
                fullWidth
                className="col-span-4 h-11 md:w-auto"
              />
              {countingDown ? (
                <label className="relative col-span-2 block min-w-0 md:w-28">
                  <Input
                    id="live-period-length"
                    type="number"
                    min={0}
                    max={120}
                    aria-label="Period length (minutes)"
                    defaultValue={Math.round(scoreboard.clock.resetMs / 60_000) || ""}
                    placeholder="40"
                    className="h-11 pr-11 text-base md:text-base"
                    onBlur={(event) => event.currentTarget.value && dispatch({ type: "periodLength", minutes: Number(event.currentTarget.value) })}
                    onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                  />
                  <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                    min
                  </span>
                </label>
              ) : null}
            </>
          ) : null}
          <div className="col-span-4 min-w-0 max-md:order-last md:flex-[1_1_12rem]">
            {notice ?? <p className="text-[13px] leading-snug text-muted-foreground">{CLOCK_HINT}</p>}
          </div>
          <Button
            type="button"
            variant="outline"
            className={cn("h-11", other && countingDown ? "col-span-2" : "col-span-4")}
            onClick={() => dispatch({ type: "clockReset" })}
          >
            Reset clock
          </Button>
        </div>
      </div>
    </Panel>
  );
}
