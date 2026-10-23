import { useEffect, useState, type RefObject } from "react";
import { AudioLines } from "lucide-react";
import type { FollowMode } from "@/src/lib/teleprompter-align";
import { cn } from "@/src/lib/utils";
import { SPEECH_MODELS, listMicrophones, type ListenerLevel, type ListenerStatus, type MicChannel } from "./teleprompter-listener";
import type { AutoFollowSettings } from "./use-auto-follow";

/*
 * Auto follow's pieces of run-mode chrome: the status tag in the top bar and the settings section
 * (microphone, channel, model, live level). Same literal-hex dark palette as run mode.
 */

/** The top bar's Auto toggle (F does the same). */
export function AutoFollowButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B6E3E] pointer-coarse:h-9",
        on ? "bg-[#0F110F] text-[#DCE2DE] hover:bg-[#252925]" : "text-[#0F110F] hover:bg-black/10"
      )}
      onClick={onToggle}
      aria-pressed={on}
      title="Follow the anchor's voice (F)"
    >
      <AudioLines className="h-4 w-4" aria-hidden />
      Auto
    </button>
  );
}

const MODE_TAGS: Record<FollowMode, { label: string; className: string }> = {
  follow: { label: "Following", className: "bg-[#2BB36E]/35 text-[#073B20]" },
  hold: { label: "Holding", className: "bg-black/10 text-[#0F110F]" },
  package: { label: "Package", className: "bg-black/10 text-[#0F110F]" },
  search: { label: "Searching", className: "bg-[#F2A516]/35 text-[#4A2F00]" }
};

const TAG_CLASS = "inline-flex h-5 items-center rounded-sm px-2 text-[11px] font-medium uppercase leading-none tracking-[0.11em]";

export function AutoFollowTag({ status, mode }: { status: ListenerStatus | null; mode: FollowMode | null }) {
  if (!status || status.phase === "starting") {
    return <span className={cn(TAG_CLASS, "bg-black/10 text-[#0F110F]")}>Starting</span>;
  }
  if (status.phase === "loading") {
    const percent = status.progress === null ? "" : ` ${Math.round(status.progress * 100)}%`;
    return <span className={cn(TAG_CLASS, "bg-black/10 text-[#0F110F]")}>Loading{percent}</span>;
  }
  if (status.phase === "error") {
    return (
      <span className={cn(TAG_CLASS, "bg-[#E5484D]/30 text-[#5C0B0E]")} title={status.message}>
        Auto failed
      </span>
    );
  }
  const tag = MODE_TAGS[mode ?? "follow"];
  return <span className={cn(TAG_CLASS, tag.className)}>{tag.label}</span>;
}

const LABEL_CLASS = "text-[11px] font-medium uppercase tracking-[0.11em] text-[#DCE2DE]";
const SELECT_CLASS =
  "mt-1.5 h-8 w-full min-w-0 rounded-md border border-[#2B302B] bg-[#252925] px-2 text-xs text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2BB36E] pointer-coarse:h-10";
const METER_FLOOR_DB = -70;

function meterPercent(db: number) {
  return Math.min(100, Math.max(0, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));
}

/** Live input level with the speech threshold marked; green while it hears someone talking. */
function LevelMeter({ levelRef }: { levelRef: RefObject<ListenerLevel | null> }) {
  const [level, setLevel] = useState<ListenerLevel | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setLevel(levelRef.current), 100);
    return () => window.clearInterval(timer);
  }, [levelRef]);

  return (
    <div className="mt-3">
      <div className="relative h-2 overflow-hidden rounded-sm bg-[#252925]" aria-hidden>
        <div
          className={cn("h-full transition-[width] duration-100", level?.speaking ? "bg-[#2BB36E]" : "bg-[#6b736e]")}
          style={{ width: `${level ? meterPercent(level.db) : 0}%` }}
        />
        {level ? <div className="absolute inset-y-0 w-px bg-soft-white" style={{ left: `${meterPercent(level.thresholdDb)}%` }} /> : null}
      </div>
      <p className="mt-1 text-xs text-[#DCE2DE]">{level ? (level.speaking ? "Hearing speech" : "Quiet") : "Not listening"}</p>
    </div>
  );
}

function statusLine(status: ListenerStatus | null, enabled: boolean) {
  if (!enabled || !status) return "Off. Press F or Auto to start.";
  if (status.phase === "starting") return "Starting the microphone…";
  if (status.phase === "loading") {
    return status.progress === null
      ? "Loading the speech model…"
      : `Downloading the speech model: ${Math.round(status.progress * 100)}%. Only the first time.`;
  }
  if (status.phase === "error") return status.message;
  return `Listening (${status.engine}).`;
}

export function AutoFollowSettingsSection({
  enabled,
  settings,
  onChange,
  status,
  levelRef
}: {
  enabled: boolean;
  settings: AutoFollowSettings;
  onChange: (update: (current: AutoFollowSettings) => AutoFollowSettings) => void;
  status: ListenerStatus | null;
  levelRef: RefObject<ListenerLevel | null>;
}) {
  const [mics, setMics] = useState<Array<{ id: string; label: string }>>([]);
  const listening = status?.phase === "listening";

  // Names show up once Chrome has microphone permission, so look again when listening starts.
  useEffect(() => {
    let active = true;
    const refresh = () => {
      listMicrophones()
        .then((found) => {
          if (active) setMics(found);
        })
        .catch(() => undefined);
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [listening]);

  return (
    <div className="border-t border-[#2B302B] p-3">
      <p className={LABEL_CLASS}>Auto follow</p>
      <p className={cn("mt-1.5 text-xs leading-snug", status?.phase === "error" && enabled ? "text-[#FF8A8E]" : "text-[#DCE2DE]")}>
        {statusLine(status, enabled)}
      </p>
      <label className="mt-3 block">
        <span className={LABEL_CLASS}>Microphone</span>
        <select
          className={SELECT_CLASS}
          value={settings.deviceId}
          onChange={(event) => onChange((current) => ({ ...current, deviceId: event.target.value }))}
        >
          <option value="">System default</option>
          {mics.map((mic) => (
            <option key={mic.id} value={mic.id}>
              {mic.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={LABEL_CLASS}>Channel</span>
          <select
            className={SELECT_CLASS}
            value={settings.channel}
            onChange={(event) => onChange((current) => ({ ...current, channel: event.target.value as MicChannel }))}
          >
            <option value="mix">Both</option>
            <option value="left">Input 1</option>
            <option value="right">Input 2</option>
          </select>
        </label>
        <label className="block min-w-0">
          <span className={LABEL_CLASS}>Model</span>
          <select
            className={SELECT_CLASS}
            value={settings.model}
            onChange={(event) => onChange((current) => ({ ...current, model: event.target.value === "accurate" ? "accurate" : "fast" }))}
          >
            {Object.entries(SPEECH_MODELS).map(([choice, model]) => (
              <option key={choice} value={choice}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {enabled ? <LevelMeter levelRef={levelRef} /> : null}
      <p className="mt-2 text-xs leading-snug text-[#DCE2DE]">
        Click a word to follow from there. Any key or arrow takes over by hand.
      </p>
    </div>
  );
}
