"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { unlockSpookySounds } from "@/components/halloween/spooky-sounds";
import { isRunModeOpen } from "@/src/lib/run-mode-signal";
import {
  isBlackFriday,
  isThanksgivingDay,
  LEAF_PILE_AT,
  matchThanksgivingSecret,
  PARDON_CLICKS,
  readThanksgivingPrefs,
  THANKSGIVING_SECRET_MEMORY,
  writeThanksgivingPrefs
} from "@/src/lib/thanksgiving";
import { useThanksgivingActive, useThanksgivingPrefs } from "@/src/lib/use-thanksgiving";
import { GiantTurkey } from "./giant-turkey";
import { HarvestSprite, type Sprite } from "./harvest-sprite";
import { LeafPile } from "./leaf-pile";
import { playHarvestSound, type HarvestSound } from "./harvest-sounds";
import { LEAF_VARIANT_COUNT } from "./sprites";
import { ThanksgivingWelcome } from "./thanksgiving-welcome";
import "./thanksgiving.css";

type Visitor = "leaves" | "pie" | "strut" | "gust" | "wishbone";

/** How often each visitor turns up, relative to the others. */
const VISITOR_WEIGHTS: readonly (readonly [Visitor, number])[] = [
  ["leaves", 40],
  ["pie", 25],
  ["strut", 20],
  ["gust", 15],
  ["wishbone", 3]
];
const TOTAL_WEIGHT = VISITOR_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

/** First visitor after this long, then one every 9–18 s while the tab is open. */
const FIRST_VISIT_MS = 3_000;
const VISIT_MIN_MS = 9_000;
const VISIT_SPREAD_MS = 9_000;
const PIE_STAYS_MS = 15_000;
const MAX_PIES = 3;
/** Visitors that arrive on their own are quieter than the sounds people click for. */
const AMBIENT_VOLUME = 0.6;
const GONE_MS = 500;
const GESTURES = ["pointerdown", "keydown"] as const;
const GREETED_KEY = "infocus-thanksgiving-greeted";
const BLACK_FRIDAY_KEY = "infocus-thanksgiving-black-friday";
const FEAST_MS = 7_000;
const NAP_MS = 5_500;
const DRIP_MS = 4_000;
/** A pardoned turkey's last steps off the edge (matches tg-strut-exit in thanksgiving.css). */
const STRUT_EXIT_MS = 900;
/** How long an unpardoned turkey burns at the edge before it crumbles away (matches tg-crumble). */
const BURN_MS = 3_600;
/** After someone jumps in, the pile is raked back up this much later. */
const PILE_BACK_MS = 5 * 60_000;

const WISHES = [
  "May your A-roll be in focus.",
  "May every interview subject sign the release form.",
  "May your audio never peak.",
  "May your Final Cut upload on the first try.",
  "May the teleprompter never outrun the anchor.",
  "May you nail your stand-up in one take.",
  "May your b-roll be plentiful and steady.",
  "May the SD card have room for one more shot.",
  "May no one say \"um\" in your best soundbite.",
  "May your pitch get approved the first time.",
  "May the batteries be charged when you need them.",
  "May your package make the show this week."
] as const;

/** What the viewer hears after walking a turkey into the oven. */
const REPRIMANDS = [
  "Five clicks. That's all it needed. Five.",
  "It walked the whole screen hoping you'd notice. You didn't.",
  "Extra crispy. Nobody ordered extra crispy.",
  "That turkey had a medal fitting on Thursday.",
  "The InFocus Portal is not angry. Just disappointed.",
  "Next time, click the turkey. Pardons are free."
] as const;

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const leafColor = () => Math.floor(Math.random() * LEAF_VARIANT_COUNT);

function pickVisitor(): Visitor {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [visitor, weight] of VISITOR_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return visitor;
  }
  return "leaves";
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Adds one to a saved count and returns the new total. */
function bump(field: "leaves" | "pies"): number {
  const prefs = readThanksgivingPrefs();
  const total = prefs[field] + 1;
  writeThanksgivingPrefs({ ...prefs, [field]: total });
  return total;
}

/** Shows `key`'s toast once per browser (per `value`), if storage works. */
function once(key: string, value: string, show: () => void) {
  try {
    if (window.localStorage.getItem(key) === value) return;
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
  show();
}

/**
 * Falling leaves, pies, a strutting turkey (click it five times to pardon it), the odd gust of
 * wind, a rare wishbone, a leaf pile once 100 leaves are caught, typed secrets and, now and then,
 * the giant turkey, for the signed-in shell while Thanksgiving is on (src/lib/thanksgiving.ts).
 */
export function ThanksgivingGoodies() {
  return useThanksgivingActive() ? <Harvest /> : null;
}

function Harvest() {
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const [summons, setSummons] = useState(0);
  const { muted, leaves } = useThanksgivingPrefs();
  const [pileAway, setPileAway] = useState(false);
  const still = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());
  const keys = useRef<string[]>([]);
  const onScreen = useRef<Sprite[]>([]);

  useEffect(() => {
    onScreen.current = sprites;
  }, [sprites]);

  const later = useCallback((run: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  }, []);

  const remove = useCallback((id: number) => setSprites((all) => all.filter((sprite) => sprite.id !== id)), []);

  const spawn = useCallback(
    (make: (id: number) => Sprite, lifetimeMs: number) => {
      const id = (nextId.current += 1);
      setSprites((all) => [...all, make(id)]);
      later(() => remove(id), lifetimeMs);
      return id;
    },
    [later, remove]
  );

  const sound = useCallback(
    (name: HarvestSound, volume = 1) => (muted ? undefined : playHarvestSound(name, volume)),
    [muted]
  );

  const dropLeaves = useCallback(
    (count: number) => {
      for (let i = 0; i < count; i += 1) {
        const duration = between(9, 14);
        later(
          () =>
            spawn(
              (id) => ({ id, kind: "leaf", left: between(0.03, 0.95) * window.innerWidth, duration, sway: between(24, 60), variant: leafColor() }),
              duration * 1000 + 100
            ),
          i * between(300, 800)
        );
      }
    },
    [later, spawn]
  );

  const blowGust = useCallback(
    (count: number) => {
      sound("wind", AMBIENT_VOLUME);
      for (let i = 0; i < count; i += 1) {
        const duration = between(2.6, 4);
        later(
          () =>
            spawn(
              (id) => ({ id, kind: "gust", top: between(0.05, 0.9) * window.innerHeight, duration, variant: leafColor(), r: between(360, 1080) }),
              duration * 1000 + 100
            ),
          i * 60
        );
      }
    },
    [later, sound, spawn]
  );

  /** At the far edge a pardoned turkey walks off; any other turkey burns, and the viewer hears about it. */
  const reachEdge = useCallback(
    (id: number) => {
      const turkey = onScreen.current.find((sprite) => sprite.id === id);
      if (turkey?.kind !== "strut") return;
      const phase = turkey.pardoned ? "free" : "burnt";
      setSprites((all) => all.map((sprite) => (sprite.id === id && sprite.kind === "strut" ? { ...sprite, phase } : sprite)));
      if (phase === "free") {
        later(() => remove(id), STRUT_EXIT_MS);
        return;
      }
      sound("sizzle");
      toast("You let the turkey burn", { description: pick(REPRIMANDS) });
    },
    [later, remove, sound]
  );

  const visit = useCallback(() => {
    if (document.hidden || isRunModeOpen()) return;
    let visitor = still ? "pie" : pickVisitor();
    if (visitor === "pie" && onScreen.current.filter((sprite) => sprite.kind === "pie").length >= MAX_PIES) {
      if (still) return;
      visitor = "leaves";
    }
    switch (visitor) {
      case "wishbone": {
        const duration = between(14, 18);
        spawn(
          (id) => ({ id, kind: "wishbone", left: between(0.1, 0.85) * window.innerWidth, duration, sway: between(20, 40) }),
          duration * 1000 + 100
        );
        return;
      }
      case "leaves":
        dropLeaves(Math.round(between(3, 6)));
        return;
      case "pie":
        spawn(
          (id) => ({ id, kind: "pie", side: pick(["left", "right"] as const), top: Math.round(between(0.3, 0.7) * window.innerHeight), gone: false }),
          PIE_STAYS_MS
        );
        return;
      case "strut": {
        const duration = between(12, 16);
        later(() => sound("gobble", AMBIENT_VOLUME), 1_800);
        const id = spawn(
          (id) => ({ id, kind: "strut", rtl: Math.random() < 0.5, duration, clicks: 0, pardoned: false, phase: "walk" }),
          duration * 1000 + BURN_MS
        );
        later(() => reachEdge(id), duration * 1000);
        return;
      }
      case "gust":
        blowGust(14);
        return;
    }
  }, [blowGust, dropLeaves, later, reachEdge, sound, spawn, still]);

  // The visitors' schedule.
  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      visit();
      timer = window.setTimeout(tick, VISIT_MIN_MS + Math.random() * VISIT_SPREAD_MS);
    }, FIRST_VISIT_MS);
    return () => window.clearTimeout(timer);
  }, [visit]);

  // Leaving the shell (or turning Thanksgiving off) cancels every pending removal and leaf.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  // Browsers keep sound locked until the first click or key press on the page.
  useEffect(() => {
    function unlock() {
      unlockSpookySounds();
    }
    GESTURES.forEach((name) => window.addEventListener(name, unlock, { capture: true, once: true }));
    return () => GESTURES.forEach((name) => window.removeEventListener(name, unlock, true));
  }, []);

  // A greeting on Thanksgiving Day and a doorbuster on Black Friday (the welcome is its own dialog).
  useEffect(() => {
    const now = new Date();
    if (isThanksgivingDay(now)) {
      once(GREETED_KEY, now.toDateString(), () =>
        toast("Happy Thanksgiving from InFocus 🦃", { description: "Thanks for everything you make. Type p-i-e for dessert." })
      );
    } else if (isBlackFriday(now)) {
      once(BLACK_FRIDAY_KEY, now.toDateString(), () =>
        toast("Black Friday doorbusters", { description: "Everything in the Portal is 100% off today. It always was." })
      );
    }
  }, []);

  const serveFeast = useCallback(() => {
    sound("bell");
    later(() => sound("yum"), 1_000);
    spawn((id) => ({ id, kind: "feast", lasts: FEAST_MS }), FEAST_MS);
  }, [later, sound, spawn]);

  const takeNap = useCallback(() => {
    sound("snore");
    if (still) {
      toast("Food coma", { description: "Back in a minute." });
      return;
    }
    spawn((id) => ({ id, kind: "nap", lasts: NAP_MS }), NAP_MS);
  }, [sound, spawn, still]);

  const pourGravy = useCallback(() => {
    sound("glug");
    if (still) return;
    for (let i = 0; i < 9; i += 1) {
      spawn(
        (id) => ({
          id,
          kind: "drip",
          left: between(0.02, 0.96) * window.innerWidth,
          width: Math.round(between(10, 22)),
          length: Math.round(between(60, 220)),
          delay: Math.round(between(0, 900)),
          lasts: DRIP_MS
        }),
        DRIP_MS + 1_000
      );
    }
  }, [sound, spawn, still]);

  // Secrets: "gobble" calls the giant turkey, "pie" rains pies, "thanks" blows a gust of leaves,
  // "feast" serves dinner, "nap" sets off a food coma and "gravy" pours from the top of the window.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || isRunModeOpen()) return;
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-THANKSGIVING_SECRET_MEMORY);
      const secret = matchThanksgivingSecret(keys.current);
      if (!secret) return;
      keys.current = [];
      if (secret === "gobble") {
        setSummons((n) => n + 1);
      } else if (secret === "feast") {
        serveFeast();
      } else if (secret === "nap") {
        takeNap();
      } else if (secret === "gravy") {
        pourGravy();
      } else if (secret === "thanks") {
        if (still) sound("wind");
        else blowGust(36);
      } else {
        sound("yum");
        if (still) return;
        for (let i = 0; i < 20; i += 1) {
          const duration = between(1.8, 3);
          later(
            () =>
              spawn(
                (id) => ({ id, kind: "pierain", left: between(0, 0.94) * window.innerWidth, duration, r: between(-200, 200) }),
                duration * 1000 + 100
              ),
            i * 110
          );
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blowGust, later, pourGravy, serveFeast, sound, spawn, still, takeNap]);

  function cheer(at: DOMRect, text: string) {
    const x = Math.min(Math.max(at.left + at.width / 2, 70), window.innerWidth - 70);
    spawn((id) => ({ id, kind: "plus", x, y: at.top - 10, text }), 1_200);
  }

  function dismiss(id: number) {
    setSprites((all) => all.map((sprite) => (sprite.id === id && "gone" in sprite ? { ...sprite, gone: true } : sprite)));
    later(() => remove(id), GONE_MS);
  }

  /** Each click makes the turkey hop and gobble; PARDON_CLICKS on one turkey pardons it. */
  function clickTurkey(turkey: Extract<Sprite, { kind: "strut" }>, at: DOMRect) {
    if (turkey.phase === "burnt") return;
    if (turkey.pardoned) {
      sound("gobble");
      return;
    }
    const clicks = turkey.clicks + 1;
    const pardoned = clicks >= PARDON_CLICKS;
    setSprites((all) => all.map((sprite) => (sprite.id === turkey.id ? { ...turkey, clicks, pardoned } : sprite)));
    if (!pardoned) {
      sound("gobble");
      if (clicks > 1) cheer(at, `${clicks}/${PARDON_CLICKS}`);
      return;
    }
    sound("fanfare");
    cheer(at, "Pardoned!");
    toast("Turkey pardoned", { description: "By the power vested in the InFocus Portal, this turkey walks free." });
  }

  function jumpIn(at: DOMRect) {
    setPileAway(true);
    later(() => setPileAway(false), PILE_BACK_MS);
    sound("rustle");
    later(() => sound("rustle"), 120);
    later(() => sound("wind", AMBIENT_VOLUME), 200);
    cheer(at, "Wheee!");
    if (still) return;
    for (let i = 0; i < 18; i += 1) {
      const duration = between(1.3, 2);
      spawn(
        (id) => ({
          id,
          kind: "burst",
          x: at.left + between(0, at.width - 30),
          y: at.top,
          dx: between(-220, 220),
          dy: between(-260, -120),
          r: between(-540, 540),
          duration,
          variant: leafColor()
        }),
        duration * 1000 + 100
      );
    }
  }

  function hit(sprite: Sprite, at: DOMRect) {
    switch (sprite.kind) {
      case "leaf": {
        remove(sprite.id);
        sound("rustle");
        const leaves = bump("leaves");
        cheer(at, `+1 · ${leaves} leaves`);
        if (leaves === LEAF_PILE_AT) toast(`${leaves} leaves caught`, { description: "That's a real pile. It's in the corner now. Jump in." });
        else if (leaves % 25 === 0) toast(`${leaves} leaves caught`, { description: "Keep raking." });
        return;
      }
      case "pie": {
        if (sprite.gone) return;
        dismiss(sprite.id);
        sound("yum");
        const pies = bump("pies");
        cheer(at, `+1 · ${pies} pies`);
        if (pies % 10 === 0) toast(`${pies} pies eaten`, { description: "Save some for the anchors." });
        return;
      }
      case "strut":
        return clickTurkey(sprite, at);
      case "wishbone": {
        remove(sprite.id);
        sound("snap");
        cheer(at, "Snap!");
        toast("You got the bigger half", { description: pick(WISHES) });
        return;
      }
      default:
        return;
    }
  }

  return (
    <>
      <GiantTurkey summons={summons} />
      <div className="tg-layer">
        {leaves >= LEAF_PILE_AT && !pileAway ? <LeafPile onJump={jumpIn} /> : null}
        {sprites.map((sprite) => (
          <HarvestSprite key={sprite.id} sprite={sprite} onHit={hit} />
        ))}
      </div>
      <ThanksgivingWelcome />
    </>
  );
}
