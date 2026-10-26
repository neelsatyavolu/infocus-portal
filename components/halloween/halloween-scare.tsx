"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useHalloweenPrefs } from "@/src/lib/use-halloween";
import { mediaIsPlaying } from "./halloween-music";
import { playScareSound, type ScareVariant } from "./scare-sounds";
import { runningSpookyAudio } from "./spooky-sounds";
import { BatSprite, EyesSprite, GhostSprite, PumpkinSprite, SpiderSprite } from "./sprites";

/** The first one 6–15 s in, then one at a random moment every 1–2.5 minutes. */
const FIRST_SCARE_MIN_MS = 6_000;
const FIRST_SCARE_SPREAD_MS = 9_000;
const SCARE_MIN_MS = 60_000;
const SCARE_SPREAD_MS = 90_000;
/** Not a good moment (sound still locked, video playing, tab hidden): check again soon. */
const RETRY_MS = 2_000;
const SCARE_VOLUME = 0.85;
const SECRET = "scare";
const BAT_COUNT = 18;

const SCARES: Record<ScareVariant, { lastsMs: number; text: string }> = {
  ghost: { lastsMs: 1_600, text: "BOO!" },
  pumpkin: { lastsMs: 1_800, text: "BOO! HA HA" },
  spider: { lastsMs: 1_800, text: "BOO!" },
  eyes: { lastsMs: 2_400, text: "BOO!" },
  bats: { lastsMs: 1_800, text: "BOOOO!" }
};
const VARIANTS = Object.keys(SCARES) as ScareVariant[];

type Scare = { id: number; variant: ScareVariant; bats: CSSProperties[] };

const between = (min: number, max: number) => min + Math.random() * (max - min);

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** Any variant but the last one, so two BOOs in a row never look the same. */
function nextVariant(last: ScareVariant | null): ScareVariant {
  const choices = VARIANTS.filter((variant) => variant !== last);
  return choices[Math.floor(Math.random() * choices.length)];
}

/** Where each bat in the swarm flies to, from the middle of the screen out past the edges. */
function batFlights(): CSSProperties[] {
  return Array.from({ length: BAT_COUNT }, (_, index) => {
    const angle = (index / BAT_COUNT) * Math.PI * 2 + between(-0.15, 0.15);
    const reach = between(0.55, 0.8);
    return {
      "--hw-x": `${Math.cos(angle) * reach * 100}vw`,
      "--hw-y": `${Math.sin(angle) * reach * 100}vh`,
      animationDelay: `${between(0, 0.25)}s`
    } as CSSProperties;
  });
}

function Figure({ scare }: { scare: Scare }): ReactNode {
  switch (scare.variant) {
    case "ghost":
      return <div className="hw-scare-figure"><GhostSprite /></div>;
    case "pumpkin":
      return <div className="hw-scare-figure"><PumpkinSprite face={0} /></div>;
    case "spider":
      return <div className="hw-scare-figure"><SpiderSprite /></div>;
    case "eyes":
      return <div className="hw-scare-figure"><EyesSprite /></div>;
    case "bats":
      return scare.bats.map((style, index) => (
        <div key={index} className="hw-scare-bat" style={style}>
          <BatSprite />
        </div>
      ));
  }
}

/**
 * The big BOOs: now and then something jumps out with a loud stinger. Five variants (ghost,
 * jack-o'-lantern, spider, eyes in the dark, bat swarm), never the same one twice in a row. No
 * flashing; click-through, so they never block the page. Typing "scare" sets one off.
 */
export function HalloweenScare() {
  const { muted, scaresOff } = useHalloweenPrefs();
  const [scare, setScare] = useState<Scare | null>(null);
  const last = useRef<ScareVariant | null>(null);
  const typed = useRef("");

  const boo = useCallback(() => {
    const variant = nextVariant(last.current);
    last.current = variant;
    if (!muted) playScareSound(variant, SCARE_VOLUME);
    setScare({ id: Date.now(), variant, bats: variant === "bats" ? batFlights() : [] });
  }, [muted]);

  useEffect(() => {
    if (scaresOff) return;
    let timer = window.setTimeout(function attempt() {
      // Wait until a scare can be heard (or sounds are muted), and never over a video or a hidden tab.
      const ready = (muted || runningSpookyAudio()) && !document.hidden && !mediaIsPlaying();
      if (ready) boo();
      timer = window.setTimeout(attempt, ready ? SCARE_MIN_MS + Math.random() * SCARE_SPREAD_MS : RETRY_MS);
    }, FIRST_SCARE_MIN_MS + Math.random() * FIRST_SCARE_SPREAD_MS);
    return () => window.clearTimeout(timer);
  }, [boo, muted, scaresOff]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      typed.current = (typed.current + event.key.toLowerCase()).slice(-SECRET.length);
      if (typed.current === SECRET) {
        typed.current = "";
        boo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [boo]);

  useEffect(() => {
    if (!scare) return;
    const timer = window.setTimeout(() => setScare(null), SCARES[scare.variant].lastsMs);
    return () => window.clearTimeout(timer);
  }, [scare]);

  if (!scare) return null;
  const { lastsMs, text } = SCARES[scare.variant];
  return (
    <div
      key={scare.id}
      className="hw-scare"
      data-variant={scare.variant}
      style={{ "--hw-lasts": `${lastsMs}ms` } as CSSProperties}
      aria-hidden
    >
      <Figure scare={scare} />
      <div className="hw-scare-text">{text}</div>
    </div>
  );
}
