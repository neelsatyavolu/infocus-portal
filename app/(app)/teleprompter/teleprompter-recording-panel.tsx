import { useEffect, useState } from "react";
import { cn } from "@/src/lib/utils";
import type { PrompterRecordingControls, RecordingState } from "./use-prompter-recording";

/*
 * "Record for tuning" in run mode: the REC tag in the top bar (so the anchors can see it's on)
 * and the start/stop control in Settings. Same literal-hex dark palette as run mode.
 */

const BUTTON_CLASS =
  "inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium border border-white/[0.14] bg-[#111114] text-[#FCFDFF] transition-colors duration-150 ease-[var(--ease-ui)] hover:bg-[#1A1A1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-10";

function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Re-renders every second while recording, for the clock. */
function useElapsed(state: RecordingState) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.phase !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.phase]);
  return state.phase === "recording" ? clock(now - state.startedAt) : "";
}

/** Top bar: a REC tag (the one caps marker) with the Record Red dot while recording. */
export function RecordingTag({ state }: { state: RecordingState }) {
  const elapsed = useElapsed(state);
  if (state.phase === "recording") {
    return (
      <span
        className="inline-flex h-5 items-center gap-1.5 rounded-full border border-white/[0.14] bg-[#111114] px-2 text-[11px] font-medium uppercase leading-none tracking-[0.08em] text-[#FCFDFF]"
        title="Recording for tuning Auto follow (Settings)"
      >
        <span className="rec-dot rec-dot-red" aria-hidden />
        Rec <span className="font-mono-broadcast tabular-nums tracking-normal">{elapsed}</span>
      </span>
    );
  }
  if (state.phase === "saving") {
    return (
      <span className="inline-flex h-5 items-center rounded-full bg-white/[0.08] px-2 text-xs font-medium leading-none tabular-nums text-[#FCFDFF]">
        Saving {Math.round(state.progress * 100)}%
      </span>
    );
  }
  return null;
}

function statusText(state: RecordingState, canStart: boolean, elapsed: string) {
  if (state.phase === "recording") return `Recording ${elapsed}. Stop to save it.`;
  if (state.phase === "saving") return `Saving to InFocus Drive: ${Math.round(state.progress * 100)}%`;
  if (state.phase === "saved") return `Saved to InFocus Drive: ${state.folder}`;
  if (state.phase === "failed") return `${state.message} Save it before recording again.`;
  return canStart ? "Off." : "Turn Auto on to record.";
}

/** Settings: start and stop by hand; saves to InFocus Drive on stop. */
export function RecordingSection({ recording }: { recording: PrompterRecordingControls }) {
  const { state, canStart } = recording;
  const elapsed = useElapsed(state);
  const recordingNow = state.phase === "recording";

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <p className="text-[13px] font-medium text-[#FCFDFF]">Record for tuning</p>
      <p className="mt-1.5 text-xs leading-snug text-[#A1A4A5]">
        Records what Auto hears and what it understood, and saves it to InFocus Drive so we can see where it slips. Tell the
        anchors before you start.
      </p>
      <p className={cn("mt-1.5 text-xs leading-snug", state.phase === "failed" ? "text-[#FF4D5E]" : "text-[#FCFDFF]")} role="status">
        {statusText(state, canStart, elapsed)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {recordingNow ? (
          <button type="button" className={BUTTON_CLASS} onClick={recording.stop}>
            Stop and save
          </button>
        ) : (
          <button type="button" className={BUTTON_CLASS} onClick={recording.start} disabled={!canStart}>
            Start recording
          </button>
        )}
        {state.phase === "failed" ? (
          <>
            <button type="button" className={BUTTON_CLASS} onClick={recording.retry}>
              Try again
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={recording.download}>
              Save to this computer
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={recording.discard}>
              Discard
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
