"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "@/components/kit/remembered-state";
import {
  isHalloweenDay,
  matchHalloweenSecret,
  readHalloweenPrefs,
  SECRET_MEMORY,
  writeHalloweenPrefs
} from "@/src/lib/halloween";
import { isRunModeOpen } from "@/src/lib/run-mode-signal";
import { useHalloweenActive, useHalloweenPrefs } from "@/src/lib/use-halloween";
import { HalloweenMusic } from "./halloween-music";
import { HalloweenHauntings } from "./halloween-hauntings";
import { HalloweenScare } from "./halloween-scare";
import { HalloweenWelcome } from "./halloween-welcome";
import { HauntingSprite, type Sprite } from "./haunting-sprite";
import { playSpookySound, type SpookySound } from "./spooky-sounds";
import { CANDY_VARIANT_COUNT, CobwebSprite, PUMPKIN_FACE_COUNT } from "./sprites";
import "./halloween.css";

type Visitor = "pumpkin" | "candy" | "bats" | "cat" | "ghost" | "eyes" | "witch" | "spider" | "hand";

/** How often each visitor turns up, relative to the others. */
const VISITOR_WEIGHTS: readonly (readonly [Visitor, number])[] = [
  ["pumpkin", 26],
  ["candy", 14],
  ["bats", 12],
  ["cat", 10],
  ["ghost", 9],
  ["eyes", 9],
  ["witch", 8],
  ["spider", 7],
  ["hand", 5]
];
const TOTAL_WEIGHT = VISITOR_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

/** First visitor after this long, then one every 8–18 s while the tab is open. */
const FIRST_VISIT_MS = 3_000;
const VISIT_MIN_MS = 8_000;
const VISIT_SPREAD_MS = 10_000;
const PUMPKIN_STAYS_MS = 15_000;
const MAX_PUMPKINS = 3;
/** Visitors that arrive on their own are quieter than the sounds people click for. */
const AMBIENT_VOLUME = 0.6;
const GONE_MS = 500;
const GREETED_KEY = "infocus-halloween-greeted";

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const side = () => pick(["left", "right"] as const);

function pickVisitor(): Visitor {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [visitor, weight] of VISITOR_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return visitor;
  }
  return "pumpkin";
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Adds one to a saved count and returns the new total. */
function bump(field: "smashed" | "candy"): number {
  const prefs = readHalloweenPrefs();
  const total = prefs[field] + 1;
  writeHalloweenPrefs({ ...prefs, [field]: total });
  return total;
}

/**
 * The welcome, music, visitors, cobwebs, secrets, hauntings and the odd big BOO for the signed-in
 * shell, only in the Halloween season.
 */
export function HalloweenGoodies() {
  return useHalloweenActive() ? <Haunting /> : null;
}

function Haunting() {
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const { muted } = useHalloweenPrefs();
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
    (name: SpookySound, volume = 1) => (muted ? undefined : playSpookySound(name, volume)),
    [muted]
  );

  const dropCandy = useCallback(
    (count: number, fast: boolean) => {
      for (let i = 0; i < count; i += 1) {
        const duration = fast ? between(2.5, 4) : between(9, 13);
        later(
          () =>
            spawn(
              (id) => ({
                id,
                kind: "candy",
                left: between(0.03, 0.95) * window.innerWidth,
                duration,
                sway: between(18, 48),
                variant: Math.floor(Math.random() * CANDY_VARIANT_COUNT)
              }),
              duration * 1000 + 100
            ),
          i * (fast ? 70 : between(300, 700))
        );
      }
    },
    [later, spawn]
  );

  const sendWitch = useCallback(
    (duration: number) => {
      spawn((id) => ({ id, kind: "witch", top: between(36, 120), rtl: Math.random() < 0.5, duration, gone: false }), duration * 1000);
    },
    [spawn]
  );

  const visit = useCallback(() => {
    if (document.hidden || isRunModeOpen()) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    let visitor = still ? "pumpkin" : pickVisitor();
    if (visitor === "pumpkin" && onScreen.current.filter((sprite) => sprite.kind === "pumpkin").length >= MAX_PUMPKINS) {
      if (still) return;
      visitor = "candy";
    }
    switch (visitor) {
      case "pumpkin":
        sound("creak", AMBIENT_VOLUME);
        spawn(
          (id) => ({ id, kind: "pumpkin", side: side(), top: Math.round(between(0.3, 0.7) * height), face: Math.floor(Math.random() * PUMPKIN_FACE_COUNT) }),
          PUMPKIN_STAYS_MS
        );
        return;
      case "candy":
        dropCandy(Math.round(between(3, 5)), false);
        return;
      case "bats": {
        sound("flap", AMBIENT_VOLUME);
        const rtl = Math.random() < 0.5;
        const top = between(70, 160);
        for (let i = 0; i < 3; i += 1) {
          const duration = between(6, 8.5);
          later(() => spawn((id) => ({ id, kind: "bat", top: top + between(-30, 30), rtl, duration }), duration * 1000), i * 450);
        }
        return;
      }
      case "cat": {
        const duration = between(13, 17);
        later(() => sound("meow", AMBIENT_VOLUME), 1_500);
        spawn((id) => ({ id, kind: "cat", rtl: Math.random() < 0.5, duration, gone: false }), duration * 1000);
        return;
      }
      case "ghost":
        sound("boo", AMBIENT_VOLUME);
        spawn((id) => ({ id, kind: "ghost", left: between(0.15, 0.85) * width, gone: false }), 13_000);
        return;
      case "eyes":
        spawn((id) => ({ id, kind: "eyes", side: side(), top: between(0.25, 0.85) * height, gone: false }), 7_000);
        return;
      case "witch":
        later(() => sound("cackle", AMBIENT_VOLUME), 1_200);
        sendWitch(between(8, 11));
        return;
      case "spider":
        later(() => sound("scurry", AMBIENT_VOLUME), 600);
        spawn((id) => ({ id, kind: "spider", left: between(0.2, 0.85) * width, drop: between(120, 260), gone: false }), 12_000);
        return;
      case "hand":
        spawn((id) => ({ id, kind: "hand", left: between(0.1, 0.9) * width, gone: false }), 8_000);
        return;
    }
  }, [dropCandy, later, sendWitch, sound, spawn, still]);

  // The visitors' schedule.
  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      visit();
      timer = window.setTimeout(tick, VISIT_MIN_MS + Math.random() * VISIT_SPREAD_MS);
    }, FIRST_VISIT_MS);
    return () => window.clearTimeout(timer);
  }, [visit]);

  // Leaving the shell (or turning Halloween off) cancels every pending removal and bat.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  // October 31: one greeting per browser.
  useEffect(() => {
    const now = new Date();
    if (!isHalloweenDay(now)) return;
    try {
      const today = now.toDateString();
      if (window.localStorage.getItem(GREETED_KEY) === today) return;
      window.localStorage.setItem(GREETED_KEY, today);
    } catch {
      return;
    }
    toast("Happy Halloween from InFocus 🎃", { description: "Watch for pumpkins. Type b-o-o or t-r-e-a-t if you dare." });
  }, []);

  // Secrets: "boo" bursts ghosts, "treat" showers candy, "trick" shakes the page, Konami rains pumpkins.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || isRunModeOpen()) return;
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-SECRET_MEMORY);
      const secret = matchHalloweenSecret(keys.current);
      if (!secret) return;
      keys.current = [];
      if (secret === "boo") {
        sound("boo");
        if (still) return;
        for (let i = 0; i < 8; i += 1) {
          const angle = (i / 8) * Math.PI * 2 + between(-0.2, 0.2);
          spawn(
            (id) => ({
              id,
              kind: "burst",
              x: Math.cos(angle) * window.innerWidth * 0.45,
              y: Math.sin(angle) * window.innerHeight * 0.45,
              r: between(-30, 30)
            }),
            1_700
          );
        }
      } else if (secret === "treat") {
        sound("chime");
        if (!still) dropCandy(30, true);
      } else if (secret === "trick") {
        sound("cackle");
        if (still) return;
        document.getElementById("main")?.animate(
          [0, -14, 12, -9, 7, -4, 2, 0].map((x, i) => ({ transform: `translateX(${x}px) rotate(${i % 2 ? 0.6 : -0.6}deg)` })),
          { duration: 700, easing: "ease-out" }
        );
        sendWitch(3.5);
      } else {
        sound("cackle");
        if (still) return;
        for (let i = 0; i < 28; i += 1) {
          const duration = between(1.8, 3);
          later(
            () =>
              spawn(
                (id) => ({
                  id,
                  kind: "rain",
                  left: between(0, 0.95) * window.innerWidth,
                  duration,
                  r: between(-360, 360),
                  face: Math.floor(Math.random() * PUMPKIN_FACE_COUNT)
                }),
                duration * 1000 + 100
              ),
            i * 90
          );
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dropCandy, later, sendWitch, sound, spawn, still]);

  function cheer(at: DOMRect, text: string) {
    const x = Math.min(Math.max(at.left + at.width / 2, 70), window.innerWidth - 70);
    spawn((id) => ({ id, kind: "plus", x, y: at.top - 10, text }), 1_200);
  }

  function dismiss(id: number, noise: SpookySound) {
    sound(noise);
    setSprites((all) => all.map((sprite) => (sprite.id === id && "gone" in sprite ? { ...sprite, gone: true } : sprite)));
    later(() => remove(id), GONE_MS);
  }

  function hit(sprite: Sprite, at: DOMRect) {
    switch (sprite.kind) {
      case "pumpkin": {
        remove(sprite.id);
        sound("splat");
        const smashed = bump("smashed");
        spawn((id) => ({ id, kind: "splat", side: sprite.side, top: sprite.top }), 1_400);
        cheer(at, `+1 · ${smashed} smashed`);
        if (smashed % 10 === 0) {
          later(() => sound("cackle"), 350);
          toast(`${smashed} pumpkins smashed`, { description: "The Great Pumpkin is watching." });
        }
        return;
      }
      case "candy": {
        remove(sprite.id);
        sound("chime");
        const candy = bump("candy");
        cheer(at, `+1 · ${candy} candy`);
        if (candy % 25 === 0) toast(`${candy} pieces of candy`, { description: "Save some for the anchors." });
        return;
      }
      case "bat":
        sound("flap");
        remove(sprite.id);
        return;
      case "ghost":
        return dismiss(sprite.id, "boo");
      case "spider":
        return dismiss(sprite.id, "scurry");
      case "cat":
        return dismiss(sprite.id, "meow");
      case "witch":
        return dismiss(sprite.id, "cackle");
      case "eyes":
        return dismiss(sprite.id, "creak");
      case "hand":
        return dismiss(sprite.id, "scurry");
    }
  }

  return (
    <>
      <HalloweenWelcome />
      <HalloweenScare />
      <HalloweenHauntings />
      <div className="hw-layer">
        <HalloweenMusic />
        <div className="hw-web" data-corner="top-right">
          <CobwebSprite />
        </div>
        <div className="hw-web" data-corner="bottom-left">
          <CobwebSprite />
        </div>
        {sprites.map((sprite) => (
          <HauntingSprite key={sprite.id} sprite={sprite} onHit={hit} />
        ))}
      </div>
    </>
  );
}
