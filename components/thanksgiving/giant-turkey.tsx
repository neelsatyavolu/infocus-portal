"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { mediaIsPlaying } from "@/components/halloween/halloween-music";
import { runningSpookyAudio } from "@/components/halloween/spooky-sounds";
import { isRunModeOpen, msSinceRunModeClosed } from "@/src/lib/run-mode-signal";
import { useThanksgivingPrefs } from "@/src/lib/use-thanksgiving";
import { playHarvestSound } from "./harvest-sounds";
import { TurkeySprite } from "./sprites";

/** Rare: the first one 45–90 s in, then one every 4–7 minutes. */
const FIRST_VISIT_MIN_MS = 45_000;
const FIRST_VISIT_SPREAD_MS = 45_000;
const VISIT_MIN_MS = 4 * 60_000;
const VISIT_SPREAD_MS = 3 * 60_000;
/** Not a good moment (sound locked, video playing, tab hidden, run mode, a dialog): check again soon. */
const RETRY_MS = 2_000;
const RUN_MODE_QUIET_MS = 60_000;
const VOLUME = 0.9;

/**
 * The whole visit, in ms. thanksgiving.css runs one timeline over --tg-lasts, and the sounds below
 * are timed to it: walk in from the right (0–1.4 s), stare (to 4.2 s), lunge to eat you (to 5 s),
 * back off (to 5.6 s) and walk out to the left.
 */
const LASTS_MS = 7_500;
const SOUNDS: readonly (readonly [number, "bigGobble" | "chomp" | "gobble"])[] = [
  [1_400, "bigGobble"],
  [4_500, "chomp"],
  [5_900, "gobble"]
];

/**
 * Now and then a turkey as tall as the window walks in from the right, stares at you, tries to
 * eat you and wanders off to the left. Click-through, so it never blocks the page; never over a
 * video, a dialog or teleprompter run mode, and not with reduced motion. Typing "gobble" (the
 * goodies' secret, passed in as `summons`) brings one at once.
 */
export function GiantTurkey({ summons }: { summons: number }) {
  const { muted, turkeyOff } = useThanksgivingPrefs();
  const still = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  // Whether it gobbles is settled when it arrives; muting mid-visit doesn't restart it.
  const [visit, setVisit] = useState<{ id: number; loud: boolean } | null>(null);

  const arrive = useCallback(() => {
    if (still) return;
    setVisit({ id: Date.now(), loud: !muted });
  }, [muted, still]);

  // Only a new summons brings one (not `arrive` changing when sounds are muted).
  const answered = useRef(0);
  useEffect(() => {
    if (summons <= answered.current) return;
    answered.current = summons;
    arrive();
  }, [arrive, summons]);

  useEffect(() => {
    if (turkeyOff || still) return;
    let timer = window.setTimeout(function attempt() {
      const ready =
        (muted || runningSpookyAudio()) &&
        !document.hidden &&
        !mediaIsPlaying() &&
        !isRunModeOpen() &&
        !document.querySelector("[role='dialog'], [role='alertdialog']") &&
        msSinceRunModeClosed() >= RUN_MODE_QUIET_MS;
      if (ready) arrive();
      timer = window.setTimeout(attempt, ready ? VISIT_MIN_MS + Math.random() * VISIT_SPREAD_MS : RETRY_MS);
    }, FIRST_VISIT_MIN_MS + Math.random() * FIRST_VISIT_SPREAD_MS);
    return () => window.clearTimeout(timer);
  }, [arrive, muted, still, turkeyOff]);

  useEffect(() => {
    if (!visit) return;
    const timers = [
      ...(visit.loud ? SOUNDS.map(([at, sound]) => window.setTimeout(() => playHarvestSound(sound, VOLUME), at)) : []),
      window.setTimeout(() => setVisit(null), LASTS_MS)
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [visit]);

  if (!visit) return null;
  return (
    <div key={visit.id} className="tg-giant" style={{ "--tg-lasts": `${LASTS_MS}ms` } as CSSProperties} aria-hidden>
      <div className="tg-giant-walk">
        <div className="tg-giant-figure">
          <TurkeySprite />
        </div>
      </div>
    </div>
  );
}
