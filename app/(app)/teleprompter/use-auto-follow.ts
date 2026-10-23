import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ScriptFollower, type FollowMode } from "@/src/lib/teleprompter-align";
import type { ScriptWordMap } from "@/src/lib/teleprompter-script-words";
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
const DEFAULT_SETTINGS: AutoFollowSettings = { deviceId: "", channel: "mix", secondDeviceId: "", model: "fast" };
const SYNC_MS = 200;

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
  mode: FollowMode | null;
  /** Last script word read, for fading the lines above it; null when off or nothing read yet. */
  cursor: number | null;
  levelRef: RefObject<ListenerLevel | null>;
  /** The script word the screen keeps at the playhead; null when off. Read it in the rAF loop. */
  targetRef: RefObject<number | null>;
  /** Follow from this word on (a manual jump, or a click on a word). */
  anchor: (wordIndex: number) => void;
};

export function useAutoFollow({
  wordMap,
  enabled,
  wordAtPlayhead
}: {
  wordMap: ScriptWordMap;
  enabled: boolean;
  /** The word under the playhead now, where following starts. */
  wordAtPlayhead: () => number;
}): AutoFollow {
  const [settings, setSettings] = useState<AutoFollowSettings>(readSettings);
  const [status, setStatus] = useState<ListenerStatus | null>(null);
  const [view, setView] = useState<{ cursor: number | null; mode: FollowMode | null }>({ cursor: null, mode: null });
  const levelRef = useRef<ListenerLevel | null>(null);
  const targetRef = useRef<number | null>(null);
  const followerRef = useRef<ScriptFollower | null>(null);
  const wordAtPlayheadRef = useRef(wordAtPlayhead);
  useEffect(() => {
    wordAtPlayheadRef.current = wordAtPlayhead;
  });

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

    const timer = window.setInterval(() => {
      const cursor = follower.cursor >= 0 ? follower.cursor : null;
      const mode = follower.mode(performance.now());
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
        if (follower) {
          follower.hear(words, final, performance.now());
          targetRef.current = follower.target;
        }
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
    cursor: enabled ? view.cursor : null,
    levelRef,
    targetRef,
    anchor
  };
}
