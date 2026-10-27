import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ScriptFollower, type FollowMode } from "@/src/lib/teleprompter-align";
import type { ScriptWordMap } from "@/src/lib/teleprompter-script-words";
import { parseVoiceCommand, type VoiceCommandResult } from "@/src/lib/teleprompter-voice-commands";
import {
  startListener,
  type ListenerLevel,
  type ListenerStatus,
  type MicChannel,
  type SpeechModelChoice
} from "./teleprompter-listener";

/*
 * Auto follow for run mode: listens (teleprompter-listener.ts), feeds what it hears to a
 * ScriptFollower, and exposes the word the screen should keep at the playhead. The rAF loop reads
 * `targetRef` every frame; React state (the faded lines, the mode chip) syncs a few times a second.
 */

export type AutoFollowSettings = { deviceId: string; channel: MicChannel; secondDeviceId: string; model: SpeechModelChoice };

const SETTINGS_KEY = "teleprompter-auto-follow-v1";
const ON_KEY = "teleprompter-auto-follow-on";
const DEFAULT_SETTINGS: AutoFollowSettings = { deviceId: "", channel: "mix", secondDeviceId: "", model: "fast" };
const SYNC_MS = 200;
const COMMAND_SHOWN_MS = 3000;
/** After the wake word alone, the next utterance this soon is the command. */
const WAKE_WINDOW_MS = 5000;
const UNDO_DEPTH = 5;

/** Auto is on when run mode opens, unless it was switched off (F or the button) on this computer. */
export function readAutoFollowOn() {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(ON_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveAutoFollowOn(on: boolean) {
  try {
    window.localStorage.setItem(ON_KEY, on ? "on" : "off");
  } catch {
    // Private or blocked storage: the choice applies for this run only.
  }
}

function readSettings(): AutoFollowSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AutoFollowSettings>;
    return {
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : DEFAULT_SETTINGS.deviceId,
      channel: parsed.channel === "left" || parsed.channel === "right" ? parsed.channel : DEFAULT_SETTINGS.channel,
      secondDeviceId: typeof parsed.secondDeviceId === "string" ? parsed.secondDeviceId : DEFAULT_SETTINGS.secondDeviceId,
      model: parsed.model === "accurate" ? "accurate" : DEFAULT_SETTINGS.model
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AutoFollowSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private or blocked storage: the choice applies for this run only.
  }
}

export type AutoFollow = {
  settings: AutoFollowSettings;
  setSettings: (update: (current: AutoFollowSettings) => AutoFollowSettings) => void;
  status: ListenerStatus | null;
  /** "paused" after a "Prompter, pause" voice command. */
  mode: FollowMode | "paused" | null;
  /** The last voice command, shown for a few seconds. */
  command: (VoiceCommandResult & { id: number }) | null;
  /** Last script word read, for fading the lines above it; null when off or nothing read yet. */
  cursor: number | null;
  levelRef: RefObject<ListenerLevel | null>;
  /** The script word the screen keeps at the playhead; null when off. Read it in the rAF loop. */
  targetRef: RefObject<number | null>;
  /** Follow from this word on (a manual jump, or a click on a word). */
  anchor: (wordIndex: number) => void;
};

type CommandRefs = { paused: RefObject<boolean>; undo: RefObject<number[]>; target: RefObject<number | null> };

/** Carries out a voice command: jumps go to the word and keep following from there. */
function runCommand(follower: ScriptFollower, action: Extract<VoiceCommandResult, { ok: true }>["action"], refs: CommandRefs) {
  const now = performance.now();
  if (action.kind === "pause") {
    refs.paused.current = true;
    return;
  }
  if (action.kind === "resume") {
    if (refs.paused.current) follower.anchor(follower.target, now);
    refs.paused.current = false;
    return;
  }
  const word = action.kind === "undo" ? refs.undo.current.pop() : action.word;
  if (word === undefined) return;
  if (action.kind === "goto") {
    refs.undo.current = [...refs.undo.current, follower.target].slice(-UNDO_DEPTH);
  }
  refs.paused.current = false;
  follower.anchor(word, now);
  refs.target.current = follower.target;
}

export function useAutoFollow({
  wordMap,
  sections,
  enabled,
  wordAtPlayhead
}: {
  wordMap: ScriptWordMap;
  sections: Array<{ id: string; label: string; content: string }>;
  enabled: boolean;
  /** The word under the playhead now, where following starts. */
  wordAtPlayhead: () => number;
}): AutoFollow {
  const [settings, setSettings] = useState<AutoFollowSettings>(readSettings);
  const [status, setStatus] = useState<ListenerStatus | null>(null);
  const [view, setView] = useState<{ cursor: number | null; mode: AutoFollow["mode"] }>({ cursor: null, mode: null });
  const [command, setCommand] = useState<AutoFollow["command"]>(null);
  const levelRef = useRef<ListenerLevel | null>(null);
  const targetRef = useRef<number | null>(null);
  const followerRef = useRef<ScriptFollower | null>(null);
  const pausedRef = useRef(false);
  const undoRef = useRef<number[]>([]);
  const awakeUntilRef = useRef(0);
  const wordAtPlayheadRef = useRef(wordAtPlayhead);
  const scriptRef = useRef({ wordMap, sections });
  useEffect(() => {
    wordAtPlayheadRef.current = wordAtPlayhead;
    scriptRef.current = { wordMap, sections };
  });

  useEffect(() => {
    if (!command) return;
    const timer = window.setTimeout(() => setCommand(null), "waiting" in command ? WAKE_WINDOW_MS : COMMAND_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [command]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // A fresh follower when Auto turns on, and when the script changes under it (an edit mid-show
  // renumbers the words): it picks up from whatever is at the playhead.
  useEffect(() => {
    if (!enabled) {
      followerRef.current = null;
      targetRef.current = null;
      return;
    }
    const follower = new ScriptFollower(wordMap, wordAtPlayheadRef.current(), performance.now());
    followerRef.current = follower;
    targetRef.current = follower.target;
    pausedRef.current = false;
    undoRef.current = [];

    const timer = window.setInterval(() => {
      const cursor = follower.cursor >= 0 ? follower.cursor : null;
      const mode = pausedRef.current ? "paused" : follower.mode(performance.now());
      setView((current) => (current.cursor === cursor && current.mode === mode ? current : { cursor, mode }));
    }, SYNC_MS);
    return () => window.clearInterval(timer);
  }, [enabled, wordMap]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const stop = startListener({
      model: settings.model,
      deviceId: settings.deviceId,
      channel: settings.channel,
      secondDeviceId: settings.secondDeviceId,
      onStatus: setStatus,
      onLevel: (level) => {
        levelRef.current = level;
      },
      onWords: ({ words, final }) => {
        const follower = followerRef.current;
        if (follower && !pausedRef.current) {
          follower.hear(words, final, performance.now());
          targetRef.current = follower.target;
        }
      },
      onUtterance: ({ words, afterPause }) => {
        const follower = followerRef.current;
        if (!follower) return;
        const now = performance.now();
        const awake = now < awakeUntilRef.current;
        awakeUntilRef.current = 0;
        const context = { ...scriptRef.current, map: scriptRef.current.wordMap, cursor: follower.cursor };
        const result = parseVoiceCommand(words, context, { afterPause, awake });
        if (!result) return;
        if (result.ok) runCommand(follower, result.action, { paused: pausedRef, undo: undoRef, target: targetRef });
        if ("waiting" in result) awakeUntilRef.current = now + WAKE_WINDOW_MS;
        setCommand({ ...result, id: now });
      }
    });
    return () => {
      stop();
      levelRef.current = null;
    };
  }, [enabled, settings.model, settings.deviceId, settings.channel, settings.secondDeviceId]);

  const anchor = useCallback((wordIndex: number) => {
    const follower = followerRef.current;
    if (follower) {
      follower.anchor(wordIndex, performance.now());
      targetRef.current = follower.target;
    }
  }, []);

  return {
    settings,
    setSettings,
    status: enabled ? status : null,
    mode: enabled ? view.mode : null,
    command: enabled ? command : null,
    cursor: enabled ? view.cursor : null,
    levelRef,
    targetRef,
    anchor
  };
}
