"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { isRunModeOpen } from "@/src/lib/run-mode-signal";
import { useHalloweenPrefs } from "@/src/lib/use-halloween";
import { HauntOverlay, makeCrack, makeDrips, makeHandprints, type HauntVisual } from "./haunt-overlays";
import { mediaIsPlaying } from "./halloween-music";
import { playHauntSound, type HauntSound } from "./haunting-sounds";
import { runningSpookyAudio } from "./spooky-sounds";

/** The first one 15–30 s in, then one every 25–45 s. */
const FIRST_MIN_MS = 15_000;
const FIRST_SPREAD_MS = 15_000;
const NEXT_MIN_MS = 25_000;
const NEXT_SPREAD_MS = 20_000;
/** Not a good moment (dialog open, typing, video playing…): look again soon. */
const RETRY_MS = 3_000;
/** None of the last few comes back straight away. */
const MEMORY = 6;
const VOLUME = 0.75;
const SECRET = "haunt";
const HIDDEN_TITLE_MS = 4_000;

const MESSAGES = ["I SEE YOU", "BEHIND YOU", "GET OUT", "DON'T LOOK BACK", "YOU'RE NOT ALONE", "LET ME IN", "IT'S IN THE WALLS", "WE'RE WATCHING"];
const HIDDEN_TITLES = ["Come back…", "👁 I'm still here", "Don't leave me alone", "It's behind you", "We miss you…"];

type Kind =
  | "flicker"
  | "flashlight"
  | "drips"
  | "handprints"
  | "possessed"
  | "glitch"
  | "static"
  | "crack"
  | "shadow"
  | "heartbeat"
  | "knock"
  | "tilt"
  | "drift"
  | "scratches"
  | "follower"
  | "writing"
  | "fog"
  | "footsteps"
  | "howl"
  | "thunder"
  | "scream"
  | "chains"
  | "musicBox"
  | "doorSlam"
  | "breath";

type Haunt = {
  /** How long the page shows it (0 for the sounds that play on their own). */
  lastsMs: number;
  sound: HauntSound;
  /** Something to look at; without it the haunting is a sound, or acts on the page itself. */
  visual?: () => HauntVisual;
  /** Changes the page directly; returns false when there is nothing on the page to change. */
  act?: () => boolean;
};

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const main = () => document.getElementById("main");

function onScreen(element: Element) {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
}

/** A heading on screen briefly reads a message instead, then goes back (unless React changed it). */
function possessHeading(): boolean {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("#main h1, #main h2, #main h3")).filter(
    (heading) =>
      onScreen(heading) &&
      heading.childNodes.length === 1 &&
      heading.firstChild?.nodeType === Node.TEXT_NODE &&
      (heading.textContent ?? "").trim().length >= 3
  );
  if (headings.length === 0) return false;
  const heading = pick(headings);
  const text = heading.firstChild as Text;
  const original = text.nodeValue;
  const message = pick(MESSAGES);
  text.nodeValue = message;
  heading.classList.add("hw-possessed");
  window.setTimeout(() => {
    if (text.nodeValue === message) text.nodeValue = original;
    heading.classList.remove("hw-possessed");
  }, 1_800);
  return true;
}

/** A few things on screen slide and turn a little, then slip back into place. */
function driftThings(): boolean {
  const things = Array.from(document.querySelectorAll<HTMLElement>("#main img, #main h1, #main h2, #main button, #main [data-slot='card']")).filter(onScreen);
  if (things.length === 0) return false;
  const chosen = [...things].sort(() => Math.random() - 0.5).slice(0, 4);
  chosen.forEach((thing) => {
    const x = between(-14, 14);
    const y = between(-6, 10);
    const r = between(-5, 5);
    thing.animate(
      [
        { transform: "none" },
        { transform: `translate(${x}px, ${y}px) rotate(${r}deg)`, offset: 0.45 },
        { transform: `translate(${x}px, ${y}px) rotate(${r}deg)`, offset: 0.8 },
        { transform: "none" }
      ],
      { duration: 2_400, easing: "ease-in-out" }
    );
  });
  return true;
}

function moveMain(keyframes: Keyframe[], duration: number): boolean {
  const page = main();
  if (!page) return false;
  page.animate(keyframes, { duration, easing: "ease-in-out" });
  return true;
}

function flagPage(className: string, ms: number): boolean {
  document.documentElement.classList.add(className);
  window.setTimeout(() => document.documentElement.classList.remove(className), ms);
  return true;
}

const HAUNTS: Record<Kind, Haunt> = {
  flicker: { lastsMs: 1_500, sound: "buzz", visual: () => ({ kind: "flicker" }) },
  flashlight: { lastsMs: 4_500, sound: "lightsOut", visual: () => ({ kind: "flashlight" }) },
  drips: { lastsMs: 5_000, sound: "drip", visual: makeDrips },
  handprints: { lastsMs: 5_000, sound: "glass", visual: makeHandprints },
  possessed: { lastsMs: 0, sound: "whisper", act: possessHeading },
  glitch: { lastsMs: 900, sound: "static", visual: () => ({ kind: "glitch" }), act: () => flagPage("hw-glitching", 900) },
  static: { lastsMs: 1_000, sound: "static", visual: () => ({ kind: "static" }) },
  crack: { lastsMs: 4_000, sound: "crack", visual: makeCrack },
  shadow: { lastsMs: 1_700, sound: "whoosh", visual: () => ({ kind: "shadow", rtl: Math.random() < 0.5 }) },
  heartbeat: { lastsMs: 3_300, sound: "heartbeat", visual: () => ({ kind: "heartbeat" }) },
  knock: {
    lastsMs: 0,
    sound: "knock",
    act: () =>
      moveMain(
        [0, 0.35, 0.7].flatMap((at) => [
          { transform: "none", offset: at },
          { transform: "translateY(3px) scale(0.997)", offset: at + 0.03 },
          { transform: "none", offset: at + 0.1 }
        ]),
        1_000
      )
  },
  tilt: {
    lastsMs: 0,
    sound: "creak",
    act: () =>
      moveMain(
        [
          { transform: "none", transformOrigin: "50% 0" },
          { transform: `rotate(${pick([-1.4, 1.4])}deg) translateY(6px)`, transformOrigin: "50% 0", offset: 0.4 },
          { transform: "none", transformOrigin: "50% 0" }
        ],
        3_000
      )
  },
  drift: { lastsMs: 0, sound: "scrape", act: driftThings },
  scratches: {
    lastsMs: 3_000,
    sound: "scratch",
    visual: () => ({ kind: "scratches", x: between(0.15, 0.7) * window.innerWidth, y: between(0.1, 0.5) * window.innerHeight, r: between(-30, 30) })
  },
  follower: { lastsMs: 6_500, sound: "whisper", visual: () => ({ kind: "follower" }) },
  writing: {
    lastsMs: 4_800,
    sound: "squeak",
    visual: () => ({
      kind: "writing",
      x: between(0.15, 0.55) * window.innerWidth,
      y: between(0.25, 0.65) * window.innerHeight,
      r: between(-8, 6),
      text: pick(MESSAGES)
    })
  },
  fog: { lastsMs: 5_500, sound: "wind", visual: () => ({ kind: "fog" }) },
  footsteps: { lastsMs: 0, sound: "footsteps" },
  howl: { lastsMs: 0, sound: "howl" },
  thunder: { lastsMs: 0, sound: "thunder" },
  scream: { lastsMs: 0, sound: "scream" },
  chains: { lastsMs: 0, sound: "chains" },
  musicBox: { lastsMs: 0, sound: "musicBox" },
  doorSlam: { lastsMs: 0, sound: "doorSlam" },
  breath: { lastsMs: 0, sound: "breath" }
};
const KINDS = Object.keys(HAUNTS) as Kind[];
const isSoundOnly = (kind: Kind) => !HAUNTS[kind].visual && !HAUNTS[kind].act;

function isTypingSomewhere() {
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

/** Never while someone is reading, typing, watching, in a dialog, or mid-BOO. */
function isGoodMoment() {
  return (
    !document.hidden &&
    !isRunModeOpen() &&
    !mediaIsPlaying() &&
    !isTypingSomewhere() &&
    !document.querySelector("[role='dialog'], [role='alertdialog'], .hw-scare")
  );
}

/**
 * Hauntings: every 25–45 s something strange happens to the page for a few seconds (the lights
 * flicker, a heading says something it shouldn't, the screen cracks, a shadow walks past…) or a
 * sound plays from somewhere in the house. Click-through and short, never during a video, a
 * dialog, typing or teleprompter run mode. Typing "haunt" sets one off. The tab title calls you
 * back while you're away.
 */
export function HalloweenHauntings() {
  const { muted, hauntsOff } = useHalloweenPrefs();
  const still = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const [shown, setShown] = useState<{ id: number; visual: HauntVisual; lastsMs: number; pointer: { x: number; y: number } } | null>(null);
  const recent = useRef<Kind[]>([]);
  const pointer = useRef({ x: 0, y: 0 });
  const typed = useRef("");

  const haunt = useCallback(() => {
    const canHear = !muted && runningSpookyAudio() !== null;
    const choices = KINDS.filter(
      (kind) => !recent.current.includes(kind) && (isSoundOnly(kind) ? canHear : !still)
    );
    if (choices.length === 0) return;
    let kind = pick(choices);
    let { act, visual, sound, lastsMs } = HAUNTS[kind];
    if (act && !act()) {
      kind = "writing";
      ({ act, visual, sound, lastsMs } = HAUNTS[kind]);
    }
    recent.current = [...recent.current, kind].slice(-MEMORY);
    if (canHear) playHauntSound(sound, VOLUME);
    if (visual) setShown({ id: Date.now(), visual: visual(), lastsMs, pointer: { ...pointer.current } });
  }, [muted, still]);

  // Where the pointer is, for the flashlight and the follower to start from.
  useEffect(() => {
    pointer.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const move = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    if (hauntsOff) return;
    let timer = window.setTimeout(function attempt() {
      const ready = isGoodMoment();
      if (ready) haunt();
      timer = window.setTimeout(attempt, ready ? NEXT_MIN_MS + Math.random() * NEXT_SPREAD_MS : RETRY_MS);
    }, FIRST_MIN_MS + Math.random() * FIRST_SPREAD_MS);
    return () => window.clearTimeout(timer);
  }, [haunt, hauntsOff]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingSomewhere() || isRunModeOpen()) return;
      typed.current = (typed.current + event.key.toLowerCase()).slice(-SECRET.length);
      if (typed.current === SECRET) {
        typed.current = "";
        haunt();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [haunt]);

  // Away from the tab for a few seconds: the title calls you back.
  useEffect(() => {
    if (hauntsOff) return;
    let timer = 0;
    let spooky: string | null = null;
    let original = "";
    function onVisibility() {
      window.clearTimeout(timer);
      if (document.hidden) {
        timer = window.setTimeout(() => {
          original = document.title;
          spooky = pick(HIDDEN_TITLES);
          document.title = spooky;
        }, HIDDEN_TITLE_MS);
      } else if (spooky) {
        if (document.title === spooky) document.title = original;
        spooky = null;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (spooky && document.title === spooky) document.title = original;
    };
  }, [hauntsOff]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), shown.lastsMs);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div key={shown.id} className="hw-haunt" data-kind={shown.visual.kind} style={{ "--hw-lasts": `${shown.lastsMs}ms` } as CSSProperties} aria-hidden>
      <HauntOverlay visual={shown.visual} pointer={shown.pointer} />
    </div>
  );
}
