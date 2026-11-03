"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { mediaIsPlaying } from "@/components/halloween/halloween-music";
import { runningSpookyAudio } from "@/components/halloween/spooky-sounds";
import { isRunModeOpen, msSinceRunModeClosed } from "@/src/lib/run-mode-signal";
import { useThanksgivingPrefs } from "@/src/lib/use-thanksgiving";
import { tallyHarvest } from "./harvest-tally";
import { GiantTurkeyDefs, PeckHole, TurkeyCloseUp, WildTurkey } from "./giant-turkey-art";
import { playHarvestSound, type HarvestSound } from "./harvest-sounds";
import "./giant-turkey.css";

/** Rare: the first one 10–20 minutes in, then one every 30–60 minutes ("gobble" calls one any time). */
const FIRST_VISIT_MIN_MS = 10 * 60_000;
const FIRST_VISIT_SPREAD_MS = 10 * 60_000;
const VISIT_MIN_MS = 30 * 60_000;
const VISIT_SPREAD_MS = 30 * 60_000;
/** Not a good moment (sound locked, video playing, tab hidden, run mode, a dialog): check again soon. */
const RETRY_MS = 2_000;
const RUN_MODE_QUIET_MS = 60_000;
const VOLUME = 0.9;

type Phase = "in" | "strut" | "look" | "eat" | "swallow" | "out";

/**
 * The visit, in ms from arrival (giant-turkey.css styles each phase): walk in from the right,
 * fan the tail and gobble, look you over, peck three holes in the screen up close, swallow and
 * walk off to the left.
 */
const PHASES: readonly (readonly [number, Phase])[] = [
  [1_800, "strut"],
  [3_900, "look"],
  [4_700, "eat"],
  [7_300, "swallow"],
  [8_400, "out"]
];
const LASTS_MS = 10_600;
/** When the beak hits the screen; each strike starts STRIKE_LEAD_MS earlier (tg-strike in the CSS). */
const PECKS_MS = [5_200, 5_900, 6_600] as const;
const STRIKE_LEAD_MS = 300;
const SOUNDS: readonly (readonly [number, HarvestSound])[] = [
  [2_300, "bigGobble"],
  [PECKS_MS[0], "peck"],
  [PECKS_MS[1], "peck"],
  [PECKS_MS[2], "chomp"],
  [7_650, "gulp"],
  [8_500, "gobble"]
];
/** Where the three bites land, as offsets from a spot near the middle of the window. */
const BITE_SPREAD: readonly (readonly [number, number])[] = [
  [-0.17, -0.08],
  [0.02, 0.12],
  [0.18, -0.05]
];
const CRUMBS = 9;

type Crumb = { dx: number; r: number; size: number; delay: number; dark: boolean };
type Bite = { x: number; y: number; seed: number; crumbs: Crumb[] };
type Visit = { id: number; loud: boolean; bites: Bite[] };

const between = (min: number, max: number) => min + Math.random() * (max - min);

function planBites(): Bite[] {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = between(0.44, 0.56);
  const cy = between(0.42, 0.54);
  return BITE_SPREAD.map(([dx, dy]) => ({
    x: Math.round((cx + dx + between(-0.03, 0.03)) * w),
    y: Math.round((cy + dy + between(-0.03, 0.03)) * h),
    seed: Math.floor(Math.random() * 2 ** 31),
    crumbs: Array.from({ length: CRUMBS }, () => ({
      dx: Math.round(between(-90, 90)),
      r: Math.round(between(-400, 400)),
      size: Math.round(between(5, 14)),
      delay: Math.round(between(0, 140)),
      dark: Math.random() < 0.4
    }))
  }));
}

/**
 * Now and then a wild turkey as tall as the window walks in from the right, fans its tail and
 * gobbles, looks you over, then leans in and pecks three holes in the screen before swallowing
 * and wandering off to the left. Click-through, so it never blocks the page; never over a video,
 * a dialog or teleprompter run mode, and not with reduced motion. Typing "gobble" (the goodies'
 * secret, passed in as `summons`) brings one at once.
 */
export function GiantTurkey({ summons }: { summons: number }) {
  const { muted, turkeyOff } = useThanksgivingPrefs();
  const still = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  // Whether it gobbles is settled when it arrives; muting mid-visit doesn't restart it.
  const [visit, setVisit] = useState<Visit | null>(null);
  const [phase, setPhase] = useState<Phase>("in");
  const [peck, setPeck] = useState(-1);
  const [bitten, setBitten] = useState(0);

  const arrive = useCallback(() => {
    if (still) return;
    setPhase("in");
    setPeck(-1);
    setBitten(0);
    setVisit({ id: Date.now(), loud: !muted, bites: planBites() });
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
      if (ready) {
        arrive();
        // Only the turkeys that come on their own count for the leaderboard, not a typed "gobble".
        tallyHarvest("giantTurkeys");
      }
      timer = window.setTimeout(attempt, ready ? VISIT_MIN_MS + Math.random() * VISIT_SPREAD_MS : RETRY_MS);
    }, FIRST_VISIT_MIN_MS + Math.random() * FIRST_VISIT_SPREAD_MS);
    return () => window.clearTimeout(timer);
  }, [arrive, muted, still, turkeyOff]);

  useEffect(() => {
    if (!visit) return;
    const at = (ms: number, run: () => void) => window.setTimeout(run, ms);
    const timers = [
      ...PHASES.map(([ms, next]) => at(ms, () => setPhase(next))),
      ...PECKS_MS.flatMap((ms, i) => [at(ms - STRIKE_LEAD_MS, () => setPeck(i)), at(ms, () => setBitten(i + 1))]),
      ...(visit.loud ? SOUNDS.map(([ms, sound]) => at(ms, () => playHarvestSound(sound, VOLUME))) : []),
      at(LASTS_MS, () => setVisit(null))
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [visit]);

  if (!visit) return null;
  const striking = peck >= 0 && (phase === "eat" || phase === "swallow") ? visit.bites[peck] : null;
  return (
    <div key={visit.id} className="tg-giant" data-phase={phase} aria-hidden>
      <GiantTurkeyDefs />
      <div className="tg-giant-walker">
        <div className="tg-giant-figure">
          <WildTurkey />
        </div>
      </div>
      <div className="tg-bites">
        {visit.bites.slice(0, bitten).map((bite) => (
          <div key={bite.seed} className="tg-bite" style={{ left: bite.x, top: bite.y }}>
            <PeckHole seed={bite.seed} />
            {bite.crumbs.map((crumb, i) => (
              <span
                key={i}
                className="tg-crumb"
                data-dark={crumb.dark}
                style={
                  {
                    "--tg-dx": `${crumb.dx}px`,
                    "--tg-r": `${crumb.r}deg`,
                    "--tg-size": `${crumb.size}px`,
                    "--tg-delay": `${crumb.delay}ms`
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
      {striking ? (
        <div className="tg-close" data-leaving={phase === "swallow"} style={{ left: striking.x, top: striking.y }}>
          <div key={peck} className="tg-close-strike">
            <TurkeyCloseUp />
          </div>
        </div>
      ) : null}
    </div>
  );
}
