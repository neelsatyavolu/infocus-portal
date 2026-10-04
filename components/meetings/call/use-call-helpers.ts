"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nextSpeakerState, type ConnectionQuality, type SpeakerState } from "@/src/lib/meetings/client/layout";
import { sampleQuality } from "@/src/lib/meetings/client/stats";
import { watchTrackLevel } from "@/src/lib/meetings/client/audio-level";
import type { PartyTracks } from "partytracks/client";

const INITIAL_SPEAKER: SpeakerState = { uid: null, since: 0, speaking: [] };

/** Active speaker + who is talking, from per-participant audio levels (re-renders only on change). */
export function useSpeakers() {
  const levels = useRef<Record<string, number>>({});
  const stateRef = useRef<SpeakerState>(INITIAL_SPEAKER);
  const [view, setView] = useState<{ uid: string | null; speaking: readonly string[] }>({ uid: null, speaking: [] });

  useEffect(() => {
    const timer = setInterval(() => {
      const next = nextSpeakerState(stateRef.current, levels.current, Date.now());
      const prev = stateRef.current;
      stateRef.current = next;
      if (next.uid !== prev.uid || next.speaking !== prev.speaking) setView({ uid: next.uid, speaking: next.speaking });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const onLevel = useCallback((uid: string, level: number) => {
    levels.current = { ...levels.current, [uid]: level };
  }, []);

  return { activeSpeakerUid: view.uid, speaking: view.speaking, onLevel };
}

/** Feeds the local mic level into the same speaker map (and returns it for meters). */
export function useTrackLevel(track: MediaStreamTrack | undefined, onLevel?: (level: number) => void) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!track) {
      setLevel(0);
      return;
    }
    const stop = watchTrackLevel(track, (value) => {
      setLevel(value);
      onLevel?.(value);
    });
    return () => {
      stop();
      onLevel?.(0);
    };
  }, [track, onLevel]);
  return level;
}

/** Connection quality dot from getStats every 4 s. */
export function useConnectionQuality(partyTracks: PartyTracks | null) {
  const [quality, setQuality] = useState<ConnectionQuality>("unknown");
  useEffect(() => {
    if (!partyTracks) return;
    let pc: RTCPeerConnection | null = null;
    let counters: { lost: number; received: number } | null = null;
    const sub = partyTracks.peerConnection$.subscribe((next) => {
      pc = next;
      counters = null;
    });
    const timer = setInterval(() => {
      if (!pc) return;
      sampleQuality(pc, counters)
        .then((result) => {
          counters = result.counters;
          setQuality(result.quality);
        })
        .catch(() => setQuality("unknown"));
    }, 4000);
    return () => {
      sub.unsubscribe();
      clearInterval(timer);
    };
  }, [partyTracks]);
  return quality;
}

/** Phone-sized layout: narrow portrait, or a short landscape touch screen (phone on its side). */
const MOBILE_QUERY = "(max-width: 767px), (max-height: 500px) and (pointer: coarse)";
const LANDSCAPE_QUERY = "(orientation: landscape)";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}

export function useIsLandscape() {
  return useMediaQuery(LANDSCAPE_QUERY);
}

/** Stops page scroll and iOS rubber-banding while the call is on screen. */
export function useLockPageScroll() {
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((el) => ({ overflow: el.style.overflow, overscroll: el.style.overscrollBehavior }));
    targets.forEach((el) => {
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    });
    return () =>
      targets.forEach((el, i) => {
        el.style.overflow = previous[i].overflow;
        el.style.overscrollBehavior = previous[i].overscroll;
      });
  }, []);
}

/** The visible area above the on-screen keyboard (iOS shrinks visualViewport, not the layout). */
export function useVisualViewport() {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

/** getDisplayMedia is missing on iOS (Safari and WKWebView): hide screen sharing there. */
export function canShareScreen() {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/** ⌘/Ctrl+D mic, ⌘/Ctrl+E camera, ⌘/Ctrl+Alt+H hand, ⌘/Ctrl+Alt+C chat. */
export function useCallShortcuts(actions: { mic: () => void; camera: () => void; hand: () => void; chat: () => void }) {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  }, [actions]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return;
      const action = event.altKey
        ? event.code === "KeyH"
          ? ref.current.hand
          : event.code === "KeyC"
            ? ref.current.chat
            : null
        : event.code === "KeyD"
          ? ref.current.mic
          : event.code === "KeyE"
            ? ref.current.camera
            : null;
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? 0 : now - since;
}
