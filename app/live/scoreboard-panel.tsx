import { memo, useEffect, type ReactNode } from "react";
import { Panel } from "@/components/kit/panel";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { StatusTag } from "@/components/kit/status-tag";
import { LiveStage, useLiveNow } from "@/components/live/live-stage";
import { Scorebug } from "@/components/live/scorebug";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SPORTS,
  SPORT_LABELS,
  type ScoreboardAction,
  type ScoreboardState,
  type Sport
} from "@/src/lib/live/scoreboard";
import { cn } from "@/src/lib/utils";
import { CARD_LABEL_CLASS, CardLabel, ObsLink } from "./live-controls";
import { bugTags, spaceTogglesClock } from "./live-status";
import { ClockCard, FootballCard, OtherNoteCard, TeamCard, VolleyballCard } from "./scoreboard-cards";

type Dispatch = (action: ScoreboardAction) => void;

type Props = {
  scoreboard: ScoreboardState;
  dispatch: Dispatch;
  offset: number;
  overlayUrl: string;
  /** Producers and livestream managers (signed in) can make new OBS links. */
  onRotateKey?: () => void;
  /** A save or sync problem, shown in the phone clock bar in place of the game readout. */
  dockStatus?: ReactNode;
  /** A save problem in full words, shown in the clock (or set) card's hint line. */
  notice?: ReactNode;
};

const POSITION_OPTIONS: Array<{ value: ScoreboardState["position"]; label: string }> = [
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" }
];

const SCOREBOARD_HINT = "Add as a Browser Source, 1920 × 1080. The background is transparent.";

/**
 * Sport, position and reset: set up once before the game. Memoized and free of the 100ms clock,
 * so it doesn't re-render while the clock runs.
 */
const BoardSetupCard = memo(function BoardSetupCard({
  sport,
  position,
  dispatch,
  className
}: {
  sport: Sport;
  position: ScoreboardState["position"];
  dispatch: Dispatch;
  className?: string;
}) {
  function changeSport(next: Sport) {
    if (next === sport) return;
    if (!window.confirm(`Switch to ${SPORT_LABELS[next]}? This clears the score and clock. Team names and colors stay.`)) return;
    dispatch({ type: "sport", sport: next });
  }

  function resetBoard() {
    if (!window.confirm("Reset the scoreboard to 0–0? Team names and colors stay.")) return;
    dispatch({ type: "reset" });
  }

  return (
    <Panel
      padding="md"
      aria-label="Board setup"
      title="Board setup"
      className={className}
      footer={
        <>
          <span>Team names and colors stay.</span>
          <Button type="button" variant="destructive-quiet" className="h-11 md:h-9" onClick={resetBoard}>
            Reset scoreboard
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor="live-sport" className={CARD_LABEL_CLASS}>
            Sport
          </label>
          {/* A listbox, not a native select: it changes only on an explicit pick, so arrowing
              through it never raises the "clears the score" confirm. */}
          <Select value={sport} onValueChange={(next) => changeSport(next as Sport)}>
            <SelectTrigger id="live-sport" className="h-11 md:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {SPORT_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className={CARD_LABEL_CLASS} aria-hidden>
            Position
          </span>
          <SegmentedControl
            ariaLabel="Position"
            value={position}
            options={POSITION_OPTIONS}
            onChange={(next) => dispatch({ type: "position", position: next })}
            fullWidth
            className="h-11 md:h-9"
          />
        </div>
      </div>
    </Panel>
  );
});

/** OBS source 1: the bug as viewers see it, what it is showing, and its Browser Source link. */
function OnStreamCard({
  scoreboard,
  now,
  overlayUrl,
  onRotateKey,
  className
}: {
  scoreboard: ScoreboardState;
  now: number;
  overlayUrl: string;
  onRotateKey?: () => void;
  className?: string;
}) {
  const tags = bugTags(scoreboard, now);
  return (
    <Panel
      padding="md"
      aria-label="On stream"
      title="On stream"
      status={<StatusTag>Source 1</StatusTag>}
      className={className}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-start lg:grid-cols-1">
        <div className="grid min-w-0 gap-3">
          <LiveStage background="checker" className="rounded-sm">
            <div className="lv-play">
              <Scorebug state={scoreboard} now={now} />
            </div>
          </LiveStage>
          {tags.length ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <CardLabel className="mr-1">Now on the bug</CardLabel>
              {tags.map((tag) => (
                <StatusTag key={tag.id} tone={tag.tone}>
                  {tag.label}
                </StatusTag>
              ))}
            </div>
          ) : null}
        </div>
        <ObsLink url={overlayUrl} hint={SCOREBOARD_HINT} onRotate={onRotateKey} />
      </div>
    </Panel>
  );
}

/**
 * Scoreboard tab. Scoring surface first (clock, then both teams, then downs for football);
 * the bug preview, the OBS link and board setup sit in a rail from lg (below everything on
 * smaller screens).
 */
export function ScoreboardPanel({ scoreboard, dispatch, offset, overlayUrl, onRotateKey, dockStatus, notice }: Props) {
  const now = useLiveNow(offset);
  const hasClock = scoreboard.sport !== "volleyball";
  const other = scoreboard.sport === "other";

  // Space starts and stops the clock when you're not typing in a field or picking from a list.
  useEffect(() => {
    if (!hasClock) return;
    function onKey(event: KeyboardEvent) {
      if (!spaceTogglesClock(event)) return;
      event.preventDefault();
      dispatch({ type: "clockToggle" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasClock, dispatch]);

  const cardProps = { scoreboard, dispatch, now };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {hasClock ? (
          <ClockCard {...cardProps} dockStatus={dockStatus} notice={notice} />
        ) : (
          <VolleyballCard {...cardProps} notice={notice} />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <TeamCard {...cardProps} team={0} />
          <TeamCard {...cardProps} team={1} />
        </div>
        {scoreboard.sport === "football" ? <FootballCard {...cardProps} /> : null}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:flex lg:flex-col">
        <OnStreamCard scoreboard={scoreboard} now={now} overlayUrl={overlayUrl} onRotateKey={onRotateKey} className="md:col-span-2" />
        {other ? <OtherNoteCard scoreboard={scoreboard} dispatch={dispatch} /> : null}
        <BoardSetupCard
          sport={scoreboard.sport}
          position={scoreboard.position}
          dispatch={dispatch}
          className={cn(!other && "md:col-span-2")}
        />
      </div>
    </div>
  );
}
