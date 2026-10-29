"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { unlockSpookySounds } from "@/components/halloween/spooky-sounds";
import { isRunModeOpen } from "@/src/lib/run-mode-signal";
import {
  isThanksgivingDay,
  matchThanksgivingSecret,
  readThanksgivingPrefs,
  THANKSGIVING_SECRET_MEMORY,
  writeThanksgivingPrefs
} from "@/src/lib/thanksgiving";
import { useThanksgivingActive, useThanksgivingPrefs } from "@/src/lib/use-thanksgiving";
import { GiantTurkey } from "./giant-turkey";
import { HarvestSprite, type Sprite } from "./harvest-sprite";
import { playHarvestSound, type HarvestSound } from "./harvest-sounds";
import { LEAF_VARIANT_COUNT } from "./sprites";
import "./thanksgiving.css";

type Visitor = "leaves" | "pie" | "strut" | "gust";

/** How often each visitor turns up, relative to the others. */
const VISITOR_WEIGHTS: readonly (readonly [Visitor, number])[] = [
  ["leaves", 40],
  ["pie", 25],
  ["strut", 20],
  ["gust", 15]
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
const WELCOMED_KEY = "infocus-thanksgiving-welcomed";
const GREETED_KEY = "infocus-thanksgiving-greeted";

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
 * Falling leaves, pies, a strutting turkey, the odd gust of wind, a few secrets and, rarely, the
 * giant turkey, for the signed-in shell while Thanksgiving is on (src/lib/thanksgiving.ts).
 */
export function ThanksgivingGoodies() {
  return useThanksgivingActive() ? <Harvest /> : null;
}

function Harvest() {
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const [summons, setSummons] = useState(0);
  const { muted } = useThanksgivingPrefs();
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

  const visit = useCallback(() => {
    if (document.hidden || isRunModeOpen()) return;
    let visitor = still ? "pie" : pickVisitor();
    if (visitor === "pie" && onScreen.current.filter((sprite) => sprite.kind === "pie").length >= MAX_PIES) {
      if (still) return;
      visitor = "leaves";
    }
    switch (visitor) {
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
        spawn((id) => ({ id, kind: "strut", rtl: Math.random() < 0.5, duration, gone: false }), duration * 1000);
        return;
      }
      case "gust":
        blowGust(14);
        return;
    }
  }, [blowGust, dropLeaves, later, sound, spawn, still]);

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

  // A welcome once per browser, and one greeting on Thanksgiving Day.
  useEffect(() => {
    const now = new Date();
    if (isThanksgivingDay(now)) {
      once(GREETED_KEY, now.toDateString(), () =>
        toast("Happy Thanksgiving from InFocus 🦃", { description: "Thanks for everything you make. Type p-i-e for dessert." })
      );
      return;
    }
    once(WELCOMED_KEY, String(now.getFullYear()), () =>
      toast("Thanksgiving is here 🦃", {
        description: "Catch the falling leaves, eat the pies, and keep an eye out for a very big turkey. Turn it off in Settings → Appearance.",
        duration: 10_000
      })
    );
  }, []);

  // Secrets: "gobble" calls the giant turkey, "pie" rains pies, "thanks" blows a gust of leaves.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || isRunModeOpen()) return;
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-THANKSGIVING_SECRET_MEMORY);
      const secret = matchThanksgivingSecret(keys.current);
      if (!secret) return;
      keys.current = [];
      if (secret === "gobble") {
        setSummons((n) => n + 1);
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
  }, [blowGust, later, sound, spawn, still]);

  function cheer(at: DOMRect, text: string) {
    const x = Math.min(Math.max(at.left + at.width / 2, 70), window.innerWidth - 70);
    spawn((id) => ({ id, kind: "plus", x, y: at.top - 10, text }), 1_200);
  }

  function dismiss(id: number) {
    setSprites((all) => all.map((sprite) => (sprite.id === id && "gone" in sprite ? { ...sprite, gone: true } : sprite)));
    later(() => remove(id), GONE_MS);
  }

  function hit(sprite: Sprite, at: DOMRect) {
    switch (sprite.kind) {
      case "leaf": {
        remove(sprite.id);
        sound("rustle");
        const leaves = bump("leaves");
        cheer(at, `+1 · ${leaves} leaves`);
        if (leaves % 25 === 0) toast(`${leaves} leaves caught`, { description: "That's a whole pile. Jump in." });
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
        if (sprite.gone) return;
        sound("gobble");
        return dismiss(sprite.id);
      default:
        return;
    }
  }

  return (
    <>
      <GiantTurkey summons={summons} />
      <div className="tg-layer">
        {sprites.map((sprite) => (
          <HarvestSprite key={sprite.id} sprite={sprite} onHit={hit} />
        ))}
      </div>
    </>
  );
}
