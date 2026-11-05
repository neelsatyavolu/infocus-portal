"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Expand, FastForward, Minimize2, Minus, Pause, Play, Plus, Rewind, Settings2, X } from "lucide-react";
import {
  TELEPROMPTER_PLAYHEAD_TOP_PX,
  advanceTeleprompterPosition,
  followScrollStep,
  teleprompterArrowState,
  sectionIdAtPosition,
  teleprompterContentTransform,
  teleprompterMaxPosition,
  teleprompterSectionJumpPosition
} from "@/src/lib/teleprompter-motion";
import { classifyRunScriptLine, getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";
import {
  buildScriptWordMap,
  readingLineOf,
  readLinesBefore,
  scriptLineKey,
  type ScriptLinePart,
  type ScriptWordMap
} from "@/src/lib/teleprompter-script-words";
import { cn } from "@/src/lib/utils";
import { followTargetY } from "./follow-target-y";
import { AutoFollowButton, AutoFollowOverlay, AutoFollowSettingsSection, AutoFollowTag } from "./teleprompter-auto-follow-panel";
import { RecordingTag } from "./teleprompter-recording-panel";
import type { TeleprompterDoc, TeleprompterSection } from "./teleprompter-model";
import { readAutoFollowOn, saveAutoFollowOn, useAutoFollow } from "./use-auto-follow";
import { BAR_BUTTON_CLASS, BAR_CLASS, BAR_PANEL_TOP_CLASS, BAR_SELECT_CLASS, RUN_MODE_ROOT_CLASS } from "./teleprompter-run-mode-chrome";

/*
 * Full-screen run mode. Always dark (the same in Light theme), so it uses literal hexes. Scrolls
 * at a set speed by hand, or with Auto on (F) follows the anchor's voice (use-auto-follow.ts):
 * the rAF loop then eases toward the word being read instead of scrolling. Any key or touch
 * control hands it back to manual. Loaded on demand (teleprompter-run-mode-loader.tsx).
 */

type RunModeSettings = {
  bodyScale: number;
  cueScale: number;
};

/** Lines above the one being read fade; the reading line and everything below stay full white. */
const LINE_FADE_CLASS = "transition-opacity duration-300";
const READ_LINE_CLASS = "opacity-55";

const RUN_MODE_SETTINGS_KEY = "teleprompter-run-mode-settings-v2";
const DEFAULT_RUN_MODE_SETTINGS: RunModeSettings = {
  bodyScale: 1,
  cueScale: 1
};

function buildClamp(minRem: number, preferredVw: number, maxRem: number, scale: number) {
  return `clamp(${(minRem * scale).toFixed(3)}rem, ${(preferredVw * scale).toFixed(3)}vw, ${(maxRem * scale).toFixed(3)}rem)`;
}

function readRunModeSettings(): RunModeSettings {
  if (typeof window === "undefined") {
    return DEFAULT_RUN_MODE_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(RUN_MODE_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_RUN_MODE_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<RunModeSettings>;
    return {
      bodyScale:
        typeof parsed.bodyScale === "number" && Number.isFinite(parsed.bodyScale) ? parsed.bodyScale : DEFAULT_RUN_MODE_SETTINGS.bodyScale,
      cueScale:
        typeof parsed.cueScale === "number" && Number.isFinite(parsed.cueScale) ? parsed.cueScale : DEFAULT_RUN_MODE_SETTINGS.cueScale
    };
  } catch {
    return DEFAULT_RUN_MODE_SETTINGS;
  }
}

function saveRunModeSettings(settings: RunModeSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RUN_MODE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private or blocked storage: the sizes apply for this run only.
  }
}

function CueHighlight({ text, settings }: { text: string; settings: RunModeSettings }) {
  return (
    <span
      className="inline-block bg-[#fff200] px-[0.22em] py-[0.04em] font-semibold uppercase leading-[1.05] text-[#ff0000]"
      style={{
        fontSize: buildClamp(2.35, 5.1, 5.8, settings.cueScale)
      }}
    >
      {text}
    </span>
  );
}

/** Each word is its own span carrying its script word index (`data-w`), for the reading cursor. */
function SpokenLine({
  parts,
  lineIndex,
  settings,
  dimmed
}: {
  parts: ScriptLinePart[];
  lineIndex: number;
  settings: RunModeSettings;
  dimmed: boolean;
}) {
  if (parts.length === 0) {
    return null;
  }

  return (
    <p
      key={`line-${lineIndex}`}
      className={cn("text-soft-white", LINE_FADE_CLASS, dimmed && READ_LINE_CLASS)}
      style={{
        fontSize: buildClamp(2.5, 5.4, 6.2, settings.bodyScale),
        lineHeight: 1.12
      }}
    >
      {parts.map((part, partIndex) => (
        <span
          key={`${lineIndex}-${partIndex}`}
          data-w={part.wordIndex ?? undefined}
          className={cn(
            part.tone === "red" ? "text-red-500" : "",
            part.tone === "yellow" ? "text-[oklch(90.5%_0.182_98.111)]" : ""
          )}
        >
          {part.text}
        </span>
      ))}
    </p>
  );
}

function renderScriptLine(
  line: string,
  lineIndex: number,
  settings: RunModeSettings,
  parts: ScriptLinePart[],
  dimmed: boolean
) {
  const classified = classifyRunScriptLine(line);

  if (classified.kind === "gap") {
    return <div key={`line-gap-${lineIndex}`} className="h-8 md:h-14" />;
  }

  if (classified.kind === "camera") {
    return (
      <p
        key={`line-camera-${lineIndex}`}
        className={cn("uppercase text-soft-white", LINE_FADE_CLASS, dimmed && READ_LINE_CLASS)}
        style={{
          fontSize: buildClamp(2.5, 5.4, 6.2, settings.bodyScale),
          lineHeight: 1.08
        }}
      >
        {classified.text}
      </p>
    );
  }

  if (classified.kind === "cue") {
    return (
      <div key={`line-cue-${lineIndex}`} className={cn("space-y-3 md:space-y-5", LINE_FADE_CLASS, dimmed && READ_LINE_CLASS)}>
        <div>
          <CueHighlight text={classified.text} settings={settings} />
        </div>
        {classified.spoken ? <SpokenLine parts={parts} lineIndex={lineIndex} settings={settings} dimmed={false} /> : null}
      </div>
    );
  }

  return <SpokenLine key={`line-${lineIndex}`} parts={parts} lineIndex={lineIndex} settings={settings} dimmed={dimmed} />;
}

const NO_PARTS: ScriptLinePart[] = [];

/** Memoized so moving the reading line re-renders only the sections whose dimming changed. */
const RunSection = memo(function RunSection({
  section,
  settings,
  wordMap,
  readLines,
  registerSection
}: {
  section: TeleprompterSection;
  settings: RunModeSettings;
  wordMap: ScriptWordMap;
  /** Lines from the top of this section that have been read. */
  readLines: number;
  registerSection: (sectionId: string, node: HTMLElement | null) => void;
}) {
  const lines = getSectionDisplayParts(section).content.split(/\r?\n/);
  return (
    <section
      ref={(node) => registerSection(section.id, node)}
      className="mb-16 space-y-3 last:mb-0 md:mb-24 md:space-y-4"
    >
      {lines.map((line, index) =>
        renderScriptLine(
          line,
          index,
          settings,
          wordMap.lineParts.get(scriptLineKey(section.id, index)) ?? NO_PARTS,
          index < readLines
        )
      )}
    </section>
  );
});

type RunModeControl = Parameters<typeof teleprompterArrowState>[1];

const RUN_MODE_KEY_CONTROLS: Record<string, RunModeControl | undefined> = {
  " ": "space",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right"
};

const RUN_MODE_TOUCH_BUTTON_CLASS =
  "inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-[#0F110F] hover:bg-black/10 active:bg-black/10";

/** Positive px/s scrolls forward; reverse reads "REV 36" so direction never relies on a minus sign. */
function formatRunSpeed(speed: number) {
  return speed < 0 ? `REV ${Math.abs(speed)}` : `${speed}`;
}

const KEY_LEGEND: Array<{ keys: string; label: string }> = [
  { keys: "Space", label: "Pause / resume" },
  { keys: "↑", label: "Faster" },
  { keys: "↓", label: "Slower, then reverse" },
  { keys: "←", label: "Scroll back" },
  { keys: "→", label: "Scroll forward" },
  { keys: "F", label: "Auto follow on / off" },
  { keys: "Esc", label: "Exit" }
];

function DarkKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border border-[#2B302B] bg-[#252925] px-1 font-mono-broadcast text-[11px] font-medium leading-none text-[#DCE2DE]">
      {children}
    </kbd>
  );
}

function ScaleSlider({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: string;
  max: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.11em] text-[#DCE2DE]">
        {label}
        <span className="font-mono-broadcast text-xs normal-case tracking-normal tabular-nums text-[#ECEFEA]">
          {Math.round(value * 100)}%
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step="0.05"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-[#2BB36E]"
      />
    </label>
  );
}

export default function FullscreenRunMode({
  doc,
  docs,
  onSelectDoc,
  onClose
}: {
  doc: TeleprompterDoc;
  docs: TeleprompterDoc[];
  onSelectDoc: (docId: string) => void;
  onClose: () => void;
}) {
  const [speed, setSpeed] = useState(72);
  const [paused, setPaused] = useState(false);
  const [settings, setSettings] = useState<RunModeSettings>(() => readRunModeSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(doc.sections[0]?.id ?? "");
  const [auto, setAuto] = useState(readAutoFollowOn);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionEls = useRef<Record<string, HTMLElement | null>>({});
  const positionRef = useRef(0);
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const contentHeightRef = useRef(0);
  const activeSectionIdRef = useRef(activeSectionId);
  const sectionsRef = useRef(doc.sections);
  const autoRef = useRef(auto);
  const followRef = useRef({ index: -1, y: 0, at: 0, velocity: 0 });
  useEffect(() => {
    autoRef.current = auto;
    pausedRef.current = paused;
    speedRef.current = speed;
    activeSectionIdRef.current = activeSectionId;
    sectionsRef.current = doc.sections;
  });
  const sectionOptions = useMemo(
    () =>
      doc.sections.map((section) => ({
        id: section.id,
        label: getSectionDisplayParts(section).badgeLabel.toUpperCase()
      })),
    [doc.sections]
  );
  const firstSectionId = doc.sections[0]?.id ?? "";
  const [sectionStart, setSectionStart] = useState({ docId: doc.id, firstSectionId });
  if (sectionStart.docId !== doc.id || sectionStart.firstSectionId !== firstSectionId) {
    setSectionStart({ docId: doc.id, firstSectionId });
    setActiveSectionId(firstSectionId);
  }

  const registerSection = useCallback((sectionId: string, node: HTMLElement | null) => {
    sectionEls.current[sectionId] = node;
  }, []);

  const applyPosition = useCallback((next: number) => {
    positionRef.current = next;
    const node = contentRef.current;
    if (node) {
      node.style.transform = teleprompterContentTransform(next);
    }
  }, []);

  // A new show starts at its top; before useAutoFollow, so a follower rebuilt for it does too.
  useEffect(() => {
    applyPosition(0);
  }, [applyPosition, doc.id, firstSectionId]);
  const wordMap = useMemo(() => buildScriptWordMap(doc.sections), [doc.sections]);
  /** The first word whose line reaches the playhead (the last word past the end): where following starts. */
  const wordAtPlayhead = useCallback(() => {
    let last = 0;
    for (const node of contentRef.current?.querySelectorAll<HTMLElement>("[data-w]") ?? []) {
      last = Number(node.dataset.w);
      if (node.offsetTop + node.offsetHeight >= positionRef.current) {
        return last;
      }
    }
    return last;
  }, []);
  const {
    settings: followSettings,
    setSettings: setFollowSettings,
    status: followStatus,
    mode: followMode,
    command: followCommand,
    cursor: followCursor,
    levelRef: followLevelRef,
    targetRef: followTargetRef,
    anchor: followFrom,
    recording
  } = useAutoFollow({ doc, wordMap, sections: doc.sections, enabled: auto, wordAtPlayhead });
  // Lines above the word being read fade (only while following).
  const reading = readingLineOf(wordMap, followCursor);

  useEffect(() => {
    saveRunModeSettings(settings);
  }, [settings]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsBrowserFullscreen(document.fullscreenElement === containerRef.current);
    }

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    function measure() {
      contentHeightRef.current = contentRef.current?.offsetHeight ?? 0;
    }

    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [doc.id, settings.bodyScale, settings.cueScale]);

  useEffect(() => {
    let rafId = 0;
    let lastFrame = performance.now();

    /** Where follow-along wants the script; measured when the target moves (and twice a second). */
    function followPosition(now: number) {
      const index = autoRef.current ? followTargetRef.current : null;
      const follow = followRef.current;
      if (index === null || !contentRef.current) {
        follow.velocity = 0;
        return null;
      }
      if (index !== follow.index || now - follow.at > 500) {
        const y = followTargetY(contentRef.current, index);
        if (y === null) return null;
        Object.assign(follow, { index, y, at: now });
      }
      return follow.y;
    }

    function tick(now: number) {
      const deltaMs = Math.min(now - lastFrame, 48);
      lastFrame = now;
      const contentHeight = contentHeightRef.current;
      const followTarget = followPosition(now);

      if ((followTarget !== null || !pausedRef.current) && contentHeight > 0) {
        const maxPosition = teleprompterMaxPosition(contentHeight);
        if (followTarget !== null) {
          const step = followScrollStep({ position: positionRef.current, velocity: followRef.current.velocity }, followTarget, deltaMs, maxPosition);
          followRef.current.velocity = step.velocity;
          applyPosition(step.position);
        } else {
          applyPosition(advanceTeleprompterPosition(positionRef.current, speedRef.current, deltaMs, maxPosition));
        }

        const nextId = sectionIdAtPosition(
          sectionsRef.current.map((section) => ({
            id: section.id,
            top: sectionEls.current[section.id]?.offsetTop ?? 0
          })),
          positionRef.current
        );

        if (nextId && nextId !== activeSectionIdRef.current) {
          activeSectionIdRef.current = nextId;
          setActiveSectionId(nextId);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [applyPosition, followTargetRef]);

  // One path for the keys and the touch controls. With Auto on, any of them takes over where the
  // script is: Space stops there; an arrow scrolls on at the last manual speed, adjusted.
  const applyControl = useCallback((control: RunModeControl) => {
    const takingOver = autoRef.current;
    if (takingOver) {
      autoRef.current = false;
      setAuto(false);
    }
    const from = { paused: takingOver ? control === "space" : pausedRef.current, speed: speedRef.current };
    const next = takingOver && control === "space" ? from : teleprompterArrowState(from, control);
    setSpeed(next.speed);
    setPaused(next.paused);
  }, []);

  /** F and the Auto button. Turning it off leaves the script paused where it is. */
  const toggleAuto = useCallback(() => {
    const next = !autoRef.current;
    autoRef.current = next;
    setAuto(next);
    saveAutoFollowOn(next);
    if (!next) {
      setPaused(true);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") {
          return;
        }
      }

      const control = RUN_MODE_KEY_CONTROLS[event.key];
      if (control) {
        event.preventDefault();
        applyControl(control);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key.toLowerCase() === "f" && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        toggleAuto();
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyControl, onClose, toggleAuto]);

  // With Auto on, jumping to a section keeps following, from the first words at or after it.
  function jumpToSection(sectionId: string) {
    activeSectionIdRef.current = sectionId;
    setActiveSectionId(sectionId);
    applyPosition(teleprompterSectionJumpPosition(sectionEls.current[sectionId]?.offsetTop ?? 0));
    const sectionIndex = doc.sections.findIndex((section) => section.id === sectionId);
    const firstWord = wordMap.words.find((word) => word.sectionIndex >= sectionIndex) ?? wordMap.words.at(-1);
    if (autoRef.current && firstWord) {
      followFrom(firstWord.index);
    }
  }

  async function toggleBrowserFullscreen() {
    if (!containerRef.current) {
      return;
    }

    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }

    await containerRef.current.requestFullscreen();
  }

  return (
    <div
      ref={containerRef}
      className={RUN_MODE_ROOT_CLASS}
    >
      {/* One 36px row on every device: the playhead is measured from the stage below it. */}
      <header className={BAR_CLASS}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <select
            aria-label="Show"
            className={cn(BAR_SELECT_CLASS, "max-w-[40%] flex-1 sm:max-w-[280px] sm:flex-none")}
            value={doc.id}
            onChange={(event) => onSelectDoc(event.target.value)}
          >
            {docs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#6b736e]" aria-hidden />
          <select
            aria-label="Section"
            className={cn(BAR_SELECT_CLASS, "flex-1 tracking-[0.11em] sm:max-w-[220px] sm:flex-none")}
            value={activeSectionId}
            disabled={sectionOptions.length === 0}
            onMouseDown={(event) => {
              event.currentTarget.value = "";
            }}
            onBlur={(event) => {
              event.currentTarget.value = activeSectionId;
            }}
            onChange={(event) => {
              if (event.target.value) {
                jumpToSection(event.target.value);
              }
            }}
          >
            <option value="" disabled hidden />
            {sectionOptions.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status slot: following or paused, and how fast, readable from the operator's seat. */}
        <div className="flex shrink-0 items-center gap-2">
          <RecordingTag state={recording.state} />
          <span role="status" className="flex">
            {auto ? (
              <AutoFollowTag status={followStatus} mode={followMode} command={followCommand} />
            ) : paused ? (
              <span className="inline-flex h-5 items-center rounded-sm bg-[#F2A516]/35 px-2 text-[11px] font-medium uppercase leading-none tracking-[0.11em] text-[#4A2F00]">
                Paused
              </span>
            ) : null}
          </span>
          {auto ? null : (
            <span className="hidden font-mono-broadcast text-xs tabular-nums text-[#3a413c] sm:inline" title="Scroll speed">
              {formatRunSpeed(speed)} px/s
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <AutoFollowButton on={auto} onToggle={toggleAuto} />
          <button
            type="button"
            className={cn(BAR_BUTTON_CLASS, settingsOpen && "bg-black/10")}
            onClick={() => setSettingsOpen((current) => !current)}
            aria-label="Settings"
            aria-expanded={settingsOpen}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={BAR_BUTTON_CLASS}
            onClick={() => void toggleBrowserFullscreen()}
            aria-label={isBrowserFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isBrowserFullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </button>
          <button type="button" className={BAR_BUTTON_CLASS} onClick={onClose} aria-label="Exit teleprompter">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {auto ? <AutoFollowOverlay status={followStatus} onCancel={toggleAuto} /> : null}
      {settingsOpen ? (
        <div className={cn("absolute right-2 z-30 w-72 rounded-md border border-[#2B302B] bg-[#1A1D1A] text-soft-white", BAR_PANEL_TOP_CLASS)}>
          <div className="flex h-11 items-center justify-between gap-3 border-b border-[#2B302B] pl-3 pr-1.5 pointer-coarse:h-12">
            <p className="text-sm font-semibold">Settings</p>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-[#DCE2DE] transition-colors hover:bg-[#252925] hover:text-soft-white pointer-coarse:h-10 pointer-coarse:px-3"
              onClick={() => setSettings(DEFAULT_RUN_MODE_SETTINGS)}
            >
              Reset
            </button>
          </div>
          <div className="space-y-4 p-3">
            <ScaleSlider
              label="Script size"
              value={settings.bodyScale}
              min="0.55"
              max="1.3"
              onChange={(bodyScale) => setSettings((current) => ({ ...current, bodyScale }))}
            />
            <ScaleSlider
              label="Cue size"
              value={settings.cueScale}
              min="0.7"
              max="1.4"
              onChange={(cueScale) => setSettings((current) => ({ ...current, cueScale }))}
            />
          </div>
          <AutoFollowSettingsSection
            enabled={auto}
            settings={followSettings}
            onChange={setFollowSettings}
            status={followStatus}
            levelRef={followLevelRef}
            recording={recording}
          />
          <div className="border-t border-[#2B302B] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.11em] text-[#DCE2DE]">
              Keys
              <span className="font-mono-broadcast text-xs normal-case tracking-normal tabular-nums text-[#ECEFEA]">
                {formatRunSpeed(speed)} px/s
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-[#DCE2DE]">
              {KEY_LEGEND.map((entry) => (
                <div key={entry.keys} className="flex min-w-0 items-center gap-2">
                  <dt>
                    <DarkKbd>{entry.keys}</DarkKbd>
                  </dt>
                  <dd className="min-w-0 leading-tight">{entry.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0F110F]">
        <div
          className="pointer-events-none absolute left-16 z-20 md:left-20"
          style={{
            top: TELEPROMPTER_PLAYHEAD_TOP_PX,
            transform: "translateY(-50%)"
          }}
          aria-hidden="true"
        >
          <div
            className="h-0 w-0"
            style={{
              borderBottom: "22px solid transparent",
              borderLeft: "34px solid #fff",
              borderTop: "22px solid transparent"
            }}
          />
        </div>
        <div
          ref={contentRef}
          className={cn("absolute left-0 right-0 pl-28 pr-16 pt-2 md:pl-32 md:pr-20", auto && "cursor-pointer")}
          style={{
            transform: teleprompterContentTransform(0),
            willChange: "transform",
            backfaceVisibility: "hidden"
          }}
          onClick={
            auto
              ? (event) => {
                  const word = (event.target as HTMLElement).closest<HTMLElement>("[data-w]");
                  if (word?.dataset.w) {
                    followFrom(Number(word.dataset.w));
                  }
                }
              : undefined
          }
        >
          {doc.sections.map((section, sectionIndex) => (
            <RunSection
              key={section.id}
              section={section}
              settings={settings}
              wordMap={wordMap}
              readLines={readLinesBefore(sectionIndex, reading)}
              registerSection={registerSection}
            />
          ))}
        </div>
      </div>

      {/* Touch devices only: a bar under the script, so nothing covers it and
          mouse/keyboard displays look exactly as before. */}
      <footer className="relative z-20 hidden shrink-0 items-center justify-center gap-2 border-t border-[#c5ccc8] bg-[#DCE2DE] px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-[#0F110F] pointer-coarse:flex">
        <button
          type="button"
          className={RUN_MODE_TOUCH_BUTTON_CLASS}
          onClick={() => applyControl("left")}
          aria-label="Scroll backward"
        >
          <Rewind className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={RUN_MODE_TOUCH_BUTTON_CLASS}
          onClick={() => applyControl("down")}
          aria-label="Slower"
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={RUN_MODE_TOUCH_BUTTON_CLASS}
          onClick={() => applyControl("space")}
          aria-label={paused ? "Resume" : "Pause"}
        >
          {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
        <button
          type="button"
          className={RUN_MODE_TOUCH_BUTTON_CLASS}
          onClick={() => applyControl("up")}
          aria-label="Faster"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          className={RUN_MODE_TOUCH_BUTTON_CLASS}
          onClick={() => applyControl("right")}
          aria-label="Scroll forward"
        >
          <FastForward className="h-5 w-5" />
        </button>
      </footer>
    </div>
  );
}
