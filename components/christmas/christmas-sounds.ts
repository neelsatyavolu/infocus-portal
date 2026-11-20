/**
 * Christmas sound effects, synthesized like the Halloween and Thanksgiving ones (and played through
 * the same audio context, components/halloween/spooky-sounds.ts), so there are no audio files to ship.
 */

import { envelope, noiseBuffer, playThrough } from "@/components/halloween/spooky-sounds";

export type ChristmasSound = "chime" | "sleighBells" | "crunch" | "sip" | "hoHoHo" | "whoosh" | "tune" | "twinkle" | "pop";

/** A struck bell: a sine with the inharmonic partials that make it ring, decaying. */
function bell(ctx: AudioContext, t: number, out: AudioNode, freq: number, length: number, peak: number) {
  [
    [1, 1],
    [2.76, 0.35],
    [5.4, 0.15]
  ].forEach(([ratio, level]) => {
    const tone = ctx.createOscillator();
    tone.type = "sine";
    tone.frequency.value = freq * ratio;
    tone.connect(envelope(out, t, 0.004, length / ratio, peak * level));
    tone.start(t);
    tone.stop(t + length + 0.05);
  });
}

/** Caught a present: two bright bells. */
function chime(ctx: AudioContext, t: number, out: AudioNode) {
  bell(ctx, t, out, 1318.5, 0.9, 0.5);
  bell(ctx, t + 0.09, out, 1760, 1.1, 0.45);
}

/** Sleigh bells: a cluster of tiny high bells shaken in a gallop rhythm. */
function sleighBells(ctx: AudioContext, t: number, out: AudioNode) {
  for (let shake = 0; shake < 8; shake += 1) {
    const start = t + shake * 0.19 + (shake % 2) * 0.03;
    const rattle = ctx.createBufferSource();
    rattle.buffer = noiseBuffer(ctx, 0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 7200;
    filter.Q.value = 2;
    rattle.connect(filter).connect(envelope(out, start, 0.003, 0.11, 0.35));
    rattle.start(start);
    for (let i = 0; i < 3; i += 1) bell(ctx, start + i * 0.012, out, 2600 + Math.random() * 1600, 0.18, 0.12);
  }
}

/** A gingerbread bite: three crunchy noise bursts. */
function crunch(ctx: AudioContext, t: number, out: AudioNode) {
  [0, 0.14, 0.3].forEach((offset) => {
    const bite = ctx.createBufferSource();
    bite.buffer = noiseBuffer(ctx, 0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1900 + offset * 1500;
    filter.Q.value = 1.2;
    bite.connect(filter).connect(envelope(out, t + offset, 0.003, 0.1, 0.7));
    bite.start(t + offset);
  });
}

/** A sip of cocoa: a slurp whose pitch rises, then a contented "ahh" tone. */
function sip(ctx: AudioContext, t: number, out: AudioNode) {
  const slurp = ctx.createBufferSource();
  slurp.buffer = noiseBuffer(ctx, 0.5);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
  slurp.connect(filter).connect(envelope(out, t, 0.05, 0.45, 0.6));
  slurp.start(t);

  const ahh = ctx.createOscillator();
  ahh.type = "triangle";
  ahh.frequency.setValueAtTime(330, t + 0.55);
  ahh.frequency.linearRampToValueAtTime(260, t + 1.1);
  ahh.connect(envelope(out, t + 0.55, 0.08, 0.55, 0.3));
  ahh.start(t + 0.55);
  ahh.stop(t + 1.2);
}

/** "Ho ho ho": a low buzzy voice through two "oh" formants, three times, falling. */
function hoHoHo(ctx: AudioContext, t: number, out: AudioNode) {
  [0, 0.38, 0.76].forEach((offset, index) => {
    const start = t + offset;
    const voice = ctx.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(130 - index * 8, start);
    voice.frequency.exponentialRampToValueAtTime(95 - index * 6, start + 0.28);
    const gate = envelope(out, start, 0.03, 0.28, 0.9);
    [450, 800].forEach((formant, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = formant;
      filter.Q.value = 5;
      const level = ctx.createGain();
      level.gain.value = i === 0 ? 1 : 0.5;
      voice.connect(filter).connect(level).connect(gate);
    });
    voice.start(start);
    voice.stop(start + 0.34);
  });
}

/** A snowy gust: noise with a sweeping band. */
function whoosh(ctx: AudioContext, t: number, out: AudioNode) {
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(ctx, 1.8);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.5;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(1600, t + 0.9);
  filter.frequency.exponentialRampToValueAtTime(400, t + 1.7);
  wind.connect(filter).connect(envelope(out, t, 0.5, 1.7, 0.7));
  wind.start(t);
}

const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;
const C5 = 523.25;
const D5 = 587.33;
/** The "Jingle Bells" chorus (public domain, 1857): [note, beats]. */
const JINGLE_BELLS: readonly (readonly [number, number])[] = [
  [E5, 1], [E5, 1], [E5, 2],
  [E5, 1], [E5, 1], [E5, 2],
  [E5, 1], [G5, 1], [C5, 1.5], [D5, 0.5], [E5, 4],
  [F5, 1], [F5, 1], [F5, 1.5], [F5, 0.5],
  [F5, 1], [E5, 1], [E5, 1], [E5, 0.5], [E5, 0.5],
  [E5, 1], [D5, 1], [D5, 1], [E5, 1],
  [D5, 2], [G5, 2]
];
const BEAT = 0.22;

function tune(ctx: AudioContext, t: number, out: AudioNode) {
  let at = t;
  for (const [note, beats] of JINGLE_BELLS) {
    bell(ctx, at, out, note, Math.max(0.35, beats * BEAT * 1.6), 0.45);
    at += beats * BEAT;
  }
  sleighBells(ctx, t, out);
}

/** A rising sparkle (the shooting star, the tree's light show). */
function twinkle(ctx: AudioContext, t: number, out: AudioNode) {
  [1046.5, 1318.5, 1568, 2093, 2637].forEach((freq, i) => bell(ctx, t + i * 0.07, out, freq, 0.6, 0.3));
}

/** Paper tearing open. */
function pop(ctx: AudioContext, t: number, out: AudioNode) {
  const tear = ctx.createBufferSource();
  tear.buffer = noiseBuffer(ctx, 0.2);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2500;
  tear.connect(filter).connect(envelope(out, t, 0.002, 0.18, 0.5));
  tear.start(t);
}

const PLAYERS: Record<ChristmasSound, (ctx: AudioContext, t: number, out: AudioNode) => void> = {
  chime,
  sleighBells,
  crunch,
  sip,
  hoHoHo,
  whoosh,
  tune,
  twinkle,
  pop
};

/** `volume` scales the sound (1 for clicks, lower for visitors arriving on their own). */
export function playChristmasSound(sound: ChristmasSound, volume = 1) {
  playThrough(volume, PLAYERS[sound]);
}
