import { useEffect } from "react";
import { LiveStage, useLiveNow } from "@/components/live/live-stage";
import { Scorebug } from "@/components/live/scorebug";
import { Button } from "@/components/ui/button";
import { SPORTS, SPORT_LABELS, type ScoreboardAction, type ScoreboardState, type Sport } from "@/src/lib/live/scoreboard";
import { CopyUrl, Seg } from "./live-controls";
import { ClockCard, FootballCard, OtherNoteCard, TeamCard, VolleyballCard } from "./scoreboard-cards";

type Props = {
  scoreboard: ScoreboardState;
  dispatch: (action: ScoreboardAction) => void;
  offset: number;
  overlayUrl: string;
};

const SPORT_OPTIONS = SPORTS.map((sport) => ({ value: sport, label: SPORT_LABELS[sport] }));
const POSITION_OPTIONS = [
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" }
] as const;

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

export function ScoreboardPanel({ scoreboard, dispatch, offset, overlayUrl }: Props) {
  const now = useLiveNow(offset);
  const hasClock = scoreboard.sport !== "volleyball";

  // Space starts and stops the clock when you're not typing in a field.
  useEffect(() => {
    if (!hasClock) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== " " || event.repeat || isTyping(event.target)) return;
      event.preventDefault();
      dispatch({ type: "clockToggle" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasClock, dispatch]);

  function changeSport(sport: Sport) {
    if (sport === scoreboard.sport) return;
    if (!window.confirm(`Switch to ${SPORT_LABELS[sport]}? This clears the score and clock. Team names and colors stay.`)) return;
    dispatch({ type: "sport", sport });
  }

  function resetBoard() {
    if (!window.confirm("Reset the scoreboard to 0–0? Team names and colors stay.")) return;
    dispatch({ type: "reset" });
  }

  const cardProps = { scoreboard, dispatch, now };

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <section className="grid gap-3 rounded-md border border-border bg-card p-3" aria-label="Preview">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-lg font-semibold">On stream · OBS source 1</h2>
            <Seg label="Sport" value={scoreboard.sport} options={SPORT_OPTIONS} onChange={changeSport} />
          </div>
          <LiveStage background="checker" className="rounded">
            <div className="lv-play">
              <Scorebug state={scoreboard} now={now} />
            </div>
          </LiveStage>
        </section>
        {hasClock ? <ClockCard {...cardProps} /> : <VolleyballCard scoreboard={scoreboard} dispatch={dispatch} />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TeamCard {...cardProps} team={0} />
        <TeamCard {...cardProps} team={1} />
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        {scoreboard.sport === "football" ? <FootballCard {...cardProps} /> : null}
        {scoreboard.sport === "other" ? <OtherNoteCard scoreboard={scoreboard} dispatch={dispatch} /> : null}
        <section className="grid content-start gap-4 rounded-md border border-border bg-card p-4" aria-label="Setup">
          <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Setup</span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm">Position</span>
              <Seg label="Position" value={scoreboard.position} options={POSITION_OPTIONS} onChange={(position) => dispatch({ type: "position", position })} />
            </div>
            <Button type="button" size="sm" variant="destructive-quiet" onClick={resetBoard}>
              Reset scoreboard
            </Button>
          </div>
          <CopyUrl label="OBS Browser Source" url={overlayUrl} hint="Add as a Browser Source, 1920 × 1080. The background is transparent." />
        </section>
      </div>
    </div>
  );
}
