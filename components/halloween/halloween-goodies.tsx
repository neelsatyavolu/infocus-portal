"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { isHalloweenDay, readHalloweenPrefs, writeHalloweenPrefs } from "@/src/lib/halloween";
import { isRunModeOpen } from "@/src/lib/run-mode-signal";
import { useHalloweenActive, useHalloweenPrefs } from "@/src/lib/use-halloween";
import { HalloweenMusic } from "./halloween-music";
import { HalloweenScare } from "./halloween-scare";
import { playSpookySound, type SpookySound } from "./spooky-sounds";
import { BatSprite, GhostSprite, PUMPKIN_FACE_COUNT, PumpkinSprite, SpiderSprite, SplatSprite } from "./sprites";
import "./halloween.css";

type Sprite =
  | { id: number; kind: "pumpkin"; side: "left" | "right"; top: number; face: number }
  | { id: number; kind: "splat"; side: "left" | "right"; top: number }
  | { id: number; kind: "plus"; side: "left" | "right"; top: number; text: string }
  | { id: number; kind: "bat"; top: number; rtl: boolean; duration: number }
  | { id: number; kind: "ghost"; left: number; gone: boolean }
  | { id: number; kind: "spider"; left: number; drop: number; gone: boolean }
  | { id: number; kind: "burst"; x: number; y: number; r: number }
  | { id: number; kind: "rain"; left: number; duration: number; r: number; face: number };

/** First visitor after this long, then one every 8–18 s while the tab is open. */
const FIRST_VISIT_MS = 3_000;
const VISIT_MIN_MS = 8_000;
const VISIT_SPREAD_MS = 10_000;
const PUMPKIN_STAYS_MS = 15_000;
const MAX_PUMPKINS = 3;
/** Visitors that arrive on their own are quieter than the sounds people click for. */
const AMBIENT_VOLUME = 0.6;
const GREETED_KEY = "infocus-halloween-greeted";
const BOO = "boo";
const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Music, pumpkins, bats, a ghost, a spider and the odd big BOO for the signed-in shell, only in the
 * Halloween season.
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

  const visit = useCallback(() => {
    if (document.hidden || isRunModeOpen()) return;
    const roll = Math.random();
    const height = window.innerHeight;
    if (roll < 0.35 || still) {
      if (onScreen.current.filter((sprite) => sprite.kind === "pumpkin").length >= MAX_PUMPKINS) return;
      sound("creak", AMBIENT_VOLUME);
      spawn(
        (id) => ({
          id,
          kind: "pumpkin",
          side: pick(["left", "right"] as const),
          top: Math.round(between(0.3, 0.7) * height),
          face: Math.floor(Math.random() * PUMPKIN_FACE_COUNT)
        }),
        PUMPKIN_STAYS_MS
      );
    } else if (roll < 0.65) {
      sound("flap", AMBIENT_VOLUME);
      const rtl = Math.random() < 0.5;
      const top = between(70, 160);
      for (let i = 0; i < 3; i += 1) {
        const duration = between(6, 8.5);
        later(
          () => spawn((id) => ({ id, kind: "bat", top: top + between(-30, 30), rtl, duration }), duration * 1000),
          i * 450
        );
      }
    } else if (roll < 0.85) {
      sound("boo", AMBIENT_VOLUME);
      spawn((id) => ({ id, kind: "ghost", left: between(0.15, 0.85) * window.innerWidth, gone: false }), 13_000);
    } else {
      later(() => sound("scurry", AMBIENT_VOLUME), 600);
      spawn(
        (id) => ({ id, kind: "spider", left: between(0.2, 0.85) * window.innerWidth, drop: between(120, 260), gone: false }),
        12_000
      );
    }
  }, [later, sound, spawn, still]);

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
    toast("Happy Halloween from InFocus 🎃", { description: "Watch for pumpkins. Type b-o-o if you dare." });
  }, []);

  // Secrets: type "boo" for a burst of ghosts, or the Konami code for pumpkin rain.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || isRunModeOpen()) return;
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-KONAMI.length);
      const recent = keys.current;
      if (recent.slice(-BOO.length).join("") === BOO) {
        keys.current = [];
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
      } else if (recent.join(",") === KONAMI.join(",")) {
        keys.current = [];
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
  }, [later, sound, spawn, still]);

  function smash(pumpkin: Extract<Sprite, { kind: "pumpkin" }>) {
    remove(pumpkin.id);
    sound("splat");
    const prefs = readHalloweenPrefs();
    const smashed = prefs.smashed + 1;
    writeHalloweenPrefs({ ...prefs, smashed });
    spawn((id) => ({ id, kind: "splat", side: pumpkin.side, top: pumpkin.top }), 1_400);
    spawn(
      (id) => ({ id, kind: "plus", side: pumpkin.side, top: pumpkin.top - 18, text: `+1 · ${smashed} smashed` }),
      1_200
    );
    if (smashed % 10 === 0) {
      later(() => sound("cackle"), 350);
      toast(`${smashed} pumpkins smashed`, { description: "The Great Pumpkin is watching." });
    }
  }

  function dismiss(id: number, noise: SpookySound) {
    sound(noise);
    setSprites((all) => all.map((sprite) => (sprite.id === id && "gone" in sprite ? { ...sprite, gone: true } : sprite)));
    later(() => remove(id), 500);
  }

  return (
    <>
      <HalloweenScare />
      <div className="hw-layer">
        <HalloweenMusic />
      {sprites.map((sprite) => {
        switch (sprite.kind) {
          case "pumpkin":
            return (
              <button
                key={sprite.id}
                type="button"
                className="hw-pumpkin hw-hit"
                data-side={sprite.side}
                style={{ top: sprite.top }}
                onClick={() => smash(sprite)}
                aria-label="Smash the pumpkin"
              >
                <PumpkinSprite face={sprite.face} />
              </button>
            );
          case "splat":
            return (
              <div key={sprite.id} className="hw-splat" style={{ top: sprite.top, [sprite.side]: 0 }}>
                <SplatSprite />
              </div>
            );
          case "plus":
            return (
              <div key={sprite.id} className="hw-plus-one" style={{ top: sprite.top, [sprite.side]: 12 }}>
                {sprite.text}
              </div>
            );
          case "bat":
            return (
              <button
                key={sprite.id}
                type="button"
                tabIndex={-1}
                aria-hidden
                className="hw-bat hw-hit"
                data-direction={sprite.rtl ? "rtl" : "ltr"}
                style={{ top: sprite.top, "--hw-duration": `${sprite.duration}s` } as CSSProperties}
                onClick={() => {
                  sound("flap");
                  remove(sprite.id);
                }}
              >
                <BatSprite />
              </button>
            );
          case "ghost":
            return (
              <button
                key={sprite.id}
                type="button"
                className="hw-ghost hw-hit"
                data-gone={sprite.gone}
                style={{ left: sprite.left }}
                onClick={() => dismiss(sprite.id, "boo")}
                aria-label="Shoo the ghost"
              >
                <GhostSprite />
              </button>
            );
          case "spider":
            return (
              <div
                key={sprite.id}
                className="hw-spider"
                data-gone={sprite.gone}
                style={{ left: sprite.left, "--hw-drop": `${sprite.drop}px` } as CSSProperties}
              >
                <button type="button" className="hw-hit" onClick={() => dismiss(sprite.id, "scurry")} aria-label="Shoo the spider">
                  <SpiderSprite />
                </button>
              </div>
            );
          case "burst":
            return (
              <div
                key={sprite.id}
                className="hw-burst"
                style={{ "--hw-x": `${sprite.x}px`, "--hw-y": `${sprite.y}px`, "--hw-r": `${sprite.r}deg` } as CSSProperties}
              >
                <GhostSprite />
              </div>
            );
          case "rain":
            return (
              <div
                key={sprite.id}
                className="hw-rain"
                style={{ left: sprite.left, "--hw-duration": `${sprite.duration}s`, "--hw-r": `${sprite.r}deg` } as CSSProperties}
              >
                <PumpkinSprite face={sprite.face} />
              </div>
            );
        }
      })}
      </div>
    </>
  );
}
