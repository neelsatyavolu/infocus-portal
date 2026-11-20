"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { unlockSpookySounds } from "@/components/halloween/spooky-sounds";
import { isRunModeOpen } from "@/src/lib/run-mode-signal";
import {
  CHRISTMAS_LIGHT_SHOW_EVENT,
  CHRISTMAS_SECRET_MEMORY,
  daysUntilChristmas,
  isChristmasDay,
  isChristmasEve,
  matchChristmasSecret,
  readChristmasPrefs,
  writeChristmasPrefs
} from "@/src/lib/christmas";
import { useChristmasActive, useChristmasPrefs } from "@/src/lib/use-christmas";
import { ChristmasDecor } from "./christmas-decor";
import { ChristmasSprite, type Sprite } from "./christmas-sprite";
import { playChristmasSound, type ChristmasSound } from "./christmas-sounds";
import { GIFT_PILE_AT } from "./christmas-village";
import { ChristmasWelcome } from "./christmas-welcome";
import { GIFT_VARIANT_COUNT, ORNAMENT_VARIANT_COUNT } from "./sprites";
import "./christmas.css";

type Visitor = "gifts" | "gingerbread" | "cocoa" | "sleigh" | "flurry" | "star";

/** How often each visitor turns up, relative to the others. */
const VISITOR_WEIGHTS: readonly (readonly [Visitor, number])[] = [
  ["gifts", 40],
  ["gingerbread", 18],
  ["cocoa", 20],
  ["sleigh", 8],
  ["flurry", 8],
  ["star", 6]
];
const TOTAL_WEIGHT = VISITOR_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

/** First visitor after this long, then one every 20–40 s while the tab is open (calm on purpose). */
const FIRST_VISIT_MS = 6_000;
const VISIT_MIN_MS = 20_000;
const VISIT_SPREAD_MS = 20_000;
const COCOA_STAYS_MS = 15_000;
const MAX_COCOA = 2;
const GOLDEN_GIFT_CHANCE = 1 / 60;
const AMBIENT_VOLUME = 0.35;
const GONE_MS = 500;
const CAUGHT_MS = 700;
const FOG_MS = 7_000;
const LIGHT_SHOW_MS = 4_000;
const GESTURES = ["pointerdown", "keydown"] as const;
const COUNTDOWN_KEY = "infocus-christmas-countdown";

const WISHES = [
  "May your A-roll be in focus.",
  "May every interview subject sign the release form.",
  "May your audio never peak.",
  "May your Final Cut upload on the first try.",
  "May the teleprompter never outrun the anchor.",
  "May your b-roll be plentiful and steady.",
  "May your pitch get approved the first time.",
  "May your package make the show this week.",
  "May the batteries be charged when you need them.",
  "May the SD card have room for one more shot."
] as const;

const GOLDEN_GIFTS = [
  "A fully charged camera battery. The rarest gift of all.",
  "An SD card that never fills up.",
  "One interview where nobody says \"um\".",
  "A lav mic that never rustles.",
  "Perfect lighting, all day, every day."
] as const;

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const giftColor = () => Math.floor(Math.random() * GIFT_VARIANT_COUNT);

function pickVisitor(): Visitor {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [visitor, weight] of VISITOR_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return visitor;
  }
  return "gifts";
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Adds one to a saved count and returns the new total. */
function bump(field: "gifts" | "treats"): number {
  const prefs = readChristmasPrefs();
  const total = prefs[field] + 1;
  writeChristmasPrefs({ ...prefs, [field]: total });
  return total;
}

/** Shows a toast once per browser per `value`, if storage works. */
function once(key: string, value: string, show: () => void) {
  try {
    if (window.localStorage.getItem(key) === value) return;
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
  show();
}

function sleeps(days: number): string {
  return days === 1 ? "1 sleep until Christmas" : `${days} sleeps until Christmas`;
}

/**
 * Lights, snow and a snowy hill, plus visitors (presents, a gingerbread man, cocoa, Santa's sleigh,
 * snow flurries, a rare shooting star) and typed secrets, for the signed-in shell while Christmas
 * is on (src/lib/christmas.ts).
 */
export function ChristmasGoodies() {
  return useChristmasActive() ? <Christmas /> : null;
}

function Christmas() {
  const [sprites, setSprites] = useState<Sprite[]>([]);
  const [lightShow, setLightShow] = useState(false);
  const { muted, snowOff } = useChristmasPrefs();
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

  const sound = useCallback((name: ChristmasSound, volume = 1) => (muted ? undefined : playChristmasSound(name, volume)), [muted]);

  const dropGifts = useCallback(
    (count: number, fromX?: () => number) => {
      for (let i = 0; i < count; i += 1) {
        const golden = Math.random() < GOLDEN_GIFT_CHANCE;
        const duration = golden ? between(7, 9) : between(10, 15);
        later(
          () =>
            spawn(
              (id) => ({
                id,
                kind: "gift",
                left: fromX ? fromX() : between(0.04, 0.92) * window.innerWidth,
                duration,
                sway: between(16, 40),
                variant: giftColor(),
                golden
              }),
              duration * 1000 + 100
            ),
          i * between(400, 900)
        );
      }
    },
    [later, spawn]
  );

  const rain = useCallback(
    (kind: "giftrain" | "bell", count: number) => {
      for (let i = 0; i < count; i += 1) {
        const duration = between(1.8, 3);
        later(
          () =>
            spawn(
              (id) =>
                kind === "bell"
                  ? { id, kind, left: between(0, 0.94) * window.innerWidth, duration, r: between(-60, 60) }
                  : { id, kind, left: between(0, 0.94) * window.innerWidth, duration, r: between(-200, 200), variant: giftColor() },
              duration * 1000 + 100
            ),
          i * 110
        );
      }
    },
    [later, spawn]
  );

  const blowFlurry = useCallback(
    (count: number) => {
      sound("whoosh", AMBIENT_VOLUME);
      for (let i = 0; i < count; i += 1) {
        const duration = between(2.4, 4);
        later(
          () =>
            spawn(
              (id) => ({ id, kind: "flurry", top: between(0.02, 0.92) * window.innerHeight, duration, size: Math.round(between(14, 34)), r: between(180, 720) }),
              duration * 1000 + 100
            ),
          i * 50
        );
      }
    },
    [later, sound, spawn]
  );

  /** Santa flies across the top third, dropping presents along the way. */
  const flySleigh = useCallback(
    (volume = AMBIENT_VOLUME) => {
      const duration = between(9, 12);
      const rtl = Math.random() < 0.5;
      sound("sleighBells", volume);
      spawn((id) => ({ id, kind: "sleigh", rtl, top: Math.round(between(0.08, 0.3) * window.innerHeight), duration, greeted: false }), duration * 1000 + 100);
      [0.3, 0.5, 0.7].forEach((share) => {
        const x = (rtl ? 1 - share : share) * window.innerWidth;
        later(() => dropGifts(1, () => x), duration * 1000 * share);
      });
    },
    [dropGifts, later, sound, spawn]
  );

  const visit = useCallback(() => {
    if (document.hidden || isRunModeOpen()) return;
    let visitor = still ? "cocoa" : pickVisitor();
    if (visitor === "cocoa" && onScreen.current.filter((sprite) => sprite.kind === "cocoa").length >= MAX_COCOA) {
      if (still) return;
      visitor = "gifts";
    }
    switch (visitor) {
      case "gifts":
        dropGifts(Math.round(between(1, 3)));
        return;
      case "gingerbread": {
        const duration = between(7, 10);
        spawn((id) => ({ id, kind: "gingerbread", rtl: Math.random() < 0.5, duration, caught: false }), duration * 1000 + 100);
        return;
      }
      case "cocoa":
        spawn(
          (id) => ({ id, kind: "cocoa", side: pick(["left", "right"] as const), top: Math.round(between(0.3, 0.7) * window.innerHeight), gone: false }),
          COCOA_STAYS_MS
        );
        return;
      case "sleigh":
        flySleigh();
        return;
      case "flurry":
        blowFlurry(10);
        return;
      case "star": {
        const duration = between(2.6, 3.4);
        spawn((id) => ({ id, kind: "star", top: Math.round(between(0.05, 0.35) * window.innerHeight), duration }), duration * 1000 + 100);
        return;
      }
    }
  }, [blowFlurry, dropGifts, flySleigh, spawn, still]);

  // The visitors' schedule.
  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      visit();
      timer = window.setTimeout(tick, VISIT_MIN_MS + Math.random() * VISIT_SPREAD_MS);
    }, FIRST_VISIT_MS);
    return () => window.clearTimeout(timer);
  }, [visit]);

  // Leaving the shell (or turning Christmas off) cancels every pending removal and present.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  // Browsers keep sound locked until the first click or key press on the page.
  useEffect(() => {
    const unlock = () => unlockSpookySounds();
    GESTURES.forEach((name) => window.addEventListener(name, unlock, { capture: true, once: true }));
    return () => GESTURES.forEach((name) => window.removeEventListener(name, unlock, true));
  }, []);

  // A countdown once a day before Christmas, and greetings on the Eve and the Day.
  useEffect(() => {
    const now = new Date();
    const today = now.toDateString();
    if (isChristmasEve(now)) {
      once(COUNTDOWN_KEY, today, () => toast("It's Christmas Eve 🎄", { description: "Santa's sleigh is out tonight. Type s-a-n-t-a to see where he is." }));
    } else if (isChristmasDay(now)) {
      once(COUNTDOWN_KEY, today, () => toast("Merry Christmas from InFocus 🎁", { description: "Thanks for everything you made this year." }));
    } else {
      const days = daysUntilChristmas(now);
      if (days > 0) once(COUNTDOWN_KEY, today, () => toast(sleeps(days), { description: "Catch presents while you wait. They pile up under the tree." }));
    }
  }, []);

  const burst = useCallback(
    (x: number, y: number, count: number) => {
      if (still) return;
      for (let i = 0; i < count; i += 1) {
        const duration = between(1.2, 2);
        spawn(
          (id) => ({
            id,
            kind: "burst",
            x,
            y,
            dx: between(-260, 260),
            dy: between(-300, -100),
            r: between(-540, 540),
            duration,
            variant: Math.floor(Math.random() * ORNAMENT_VARIANT_COUNT)
          }),
          duration * 1000 + 100
        );
      }
    },
    [spawn, still]
  );

  const startLightShow = useCallback(() => {
    sound("twinkle");
    setLightShow(true);
    window.dispatchEvent(new CustomEvent(CHRISTMAS_LIGHT_SHOW_EVENT, { detail: true }));
    later(() => {
      setLightShow(false);
      window.dispatchEvent(new CustomEvent(CHRISTMAS_LIGHT_SHOW_EVENT, { detail: false }));
    }, LIGHT_SHOW_MS);
  }, [later, sound]);

  // Secrets: "snow" a blizzard, "santa" the sleigh, "jingle" the song, "gift" a present rain,
  // "merry" an ornament burst and "rudolph" a foggy night with a red nose to guide the sleigh.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || isRunModeOpen()) return;
      keys.current = [...keys.current, event.key.toLowerCase()].slice(-CHRISTMAS_SECRET_MEMORY);
      const secret = matchChristmasSecret(keys.current);
      if (!secret) return;
      keys.current = [];
      switch (secret) {
        case "snow":
          toast("Snow day!", { description: "Not really. Class is still on." });
          if (still) sound("whoosh");
          else blowFlurry(60);
          return;
        case "santa":
          if (still) sound("hoHoHo");
          else flySleigh(1);
          return;
        case "jingle":
          sound("tune");
          if (!still) rain("bell", 14);
          toast("Jingle all the way 🔔");
          return;
        case "gift":
          sound("pop");
          if (!still) rain("giftrain", 22);
          return;
        case "merry":
          sound("twinkle");
          burst(window.innerWidth / 2, window.innerHeight / 2, 40);
          toast("Merry Christmas from InFocus 🎄", { description: "And a happy new year of packages." });
          return;
        case "rudolph":
          sound("sleighBells");
          if (still) return;
          spawn((id) => ({ id, kind: "fog", lasts: FOG_MS }), FOG_MS);
          later(() => spawn((id) => ({ id, kind: "rudolph", duration: 6 }), 6_100), 600);
          toast("Foggy Christmas Eve", { description: "Rudolph, with your nose so bright…" });
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blowFlurry, burst, flySleigh, later, rain, sound, spawn, still]);

  function cheer(at: DOMRect, text: string) {
    const x = Math.min(Math.max(at.left + at.width / 2, 70), window.innerWidth - 70);
    spawn((id) => ({ id, kind: "plus", x, y: at.top - 10, text }), 1_200);
  }

  function mark(id: number, change: Partial<Sprite>, removeAfter: number) {
    setSprites((all) => all.map((sprite) => (sprite.id === id ? ({ ...sprite, ...change } as Sprite) : sprite)));
    later(() => remove(id), removeAfter);
  }

  function hit(sprite: Sprite, at: DOMRect) {
    switch (sprite.kind) {
      case "gift": {
        remove(sprite.id);
        burst(at.left + at.width / 2, at.top + at.height / 2, sprite.golden ? 24 : 6);
        if (sprite.golden) {
          sound("twinkle");
          cheer(at, "Golden present!");
          toast("A golden present!", { description: pick(GOLDEN_GIFTS) });
          bump("gifts");
          return;
        }
        sound("chime");
        const total = bump("gifts");
        cheer(at, `+1 · ${total} presents`);
        if (total === GIFT_PILE_AT) toast(`${total} presents caught`, { description: "Scroll to the bottom of any page: they're piling up in the village." });
        else if (total % 25 === 0) toast(`${total} presents caught`, { description: "Santa's running out of room in the sleigh." });
        return;
      }
      case "gingerbread": {
        if (sprite.caught) return;
        mark(sprite.id, { caught: true }, CAUGHT_MS);
        sound("crunch");
        const total = bump("treats");
        cheer(at, `Caught him! · ${total} treats`);
        return;
      }
      case "cocoa": {
        if (sprite.gone) return;
        mark(sprite.id, { gone: true }, GONE_MS);
        sound("sip");
        const total = bump("treats");
        cheer(at, `Ahh · ${total} treats`);
        return;
      }
      case "sleigh": {
        if (sprite.greeted) {
          sound("hoHoHo");
          return;
        }
        setSprites((all) => all.map((s) => (s.id === sprite.id ? { ...sprite, greeted: true } : s)));
        sound("hoHoHo");
        cheer(at, "Ho ho ho!");
        dropGifts(5, () => at.left + between(0, at.width));
        return;
      }
      case "star":
        remove(sprite.id);
        sound("twinkle");
        cheer(at, "Make a wish");
        toast("Wish granted", { description: pick(WISHES) });
        return;
      default:
        return;
    }
  }

  return (
    <>
      <ChristmasDecor
        snow={!snowOff && !still}
        show={lightShow}
        onLightShow={(at) => {
          startLightShow();
          burst(at.left + at.width / 2, at.top + at.height, 16);
        }}
      />
      <div className="xm-layer">
        {sprites.map((sprite) => (
          <ChristmasSprite key={sprite.id} sprite={sprite} onHit={hit} />
        ))}
      </div>
      <ChristmasWelcome />
    </>
  );
}
