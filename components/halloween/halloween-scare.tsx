"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHalloweenPrefs } from "@/src/lib/use-halloween";
import { mediaIsPlaying } from "./halloween-music";
import { playSpookySound, runningSpookyAudio } from "./spooky-sounds";
import { GhostSprite } from "./sprites";

/** Never in the first 2 minutes, then one at a random moment every 3–7 minutes. */
const FIRST_SCARE_MS = 120_000;
const SCARE_MIN_MS = 180_000;
const SCARE_SPREAD_MS = 240_000;
/** Not a good moment (sound still locked, video playing, tab hidden): try again soon. */
const RETRY_MS = 30_000;
const SCARE_LASTS_MS = 1_600;
const SCARE_VOLUME = 0.85;
const SECRET = "scare";

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * The big BOO: now and then a giant ghost lunges at the screen with a loud stinger. One zoom and
 * shake, no flashing; click-through, so it never blocks the page. Typing "scare" sets one off.
 */
export function HalloweenScare() {
  const { muted, scaresOff } = useHalloweenPrefs();
  const [showing, setShowing] = useState(0);
  const typed = useRef("");

  const scare = useCallback(() => {
    if (!muted) playSpookySound("scare", SCARE_VOLUME);
    setShowing(Date.now());
  }, [muted]);

  useEffect(() => {
    if (scaresOff) return;
    let timer = window.setTimeout(function attempt() {
      // Wait until a scare can be heard (or sounds are muted), and never over a video or a hidden tab.
      const ready = (muted || runningSpookyAudio()) && !document.hidden && !mediaIsPlaying();
      if (ready) scare();
      timer = window.setTimeout(attempt, ready ? SCARE_MIN_MS + Math.random() * SCARE_SPREAD_MS : RETRY_MS);
    }, FIRST_SCARE_MS);
    return () => window.clearTimeout(timer);
  }, [muted, scare, scaresOff]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      typed.current = (typed.current + event.key.toLowerCase()).slice(-SECRET.length);
      if (typed.current === SECRET) {
        typed.current = "";
        scare();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scare]);

  useEffect(() => {
    if (!showing) return;
    const timer = window.setTimeout(() => setShowing(0), SCARE_LASTS_MS);
    return () => window.clearTimeout(timer);
  }, [showing]);

  if (!showing) return null;
  return (
    <div key={showing} className="hw-scare" aria-hidden>
      <div className="hw-scare-ghost">
        <GhostSprite />
      </div>
      <div className="hw-scare-text">BOO!</div>
    </div>
  );
}
