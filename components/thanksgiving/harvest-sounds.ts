/**
 * Thanksgiving sound effects, synthesized like the Halloween ones (and played through the same
 * audio context, components/halloween/spooky-sounds.ts), so there are no audio files to ship.
 */

import { envelope, noiseBuffer, playThrough } from "@/components/halloween/spooky-sounds";

export type HarvestSound =
  | "gobble"
  | "bigGobble"
  | "chomp"
  | "rustle"
  | "yum"
  | "wind"
  | "bell"
  | "snore"
  | "glug"
  | "fanfare"
  | "snap";

/** A turkey's "gobble-obble-obble": a buzzy voice warbling fast while it falls in pitch. */
function gobbleAt(ctx: AudioContext, t: number, out: AudioNode, pitch: number, length: number, peak: number) {
  const voice = ctx.createOscillator();
  voice.type = "sawtooth";
  voice.frequency.setValueAtTime(pitch * 1.15, t);
  voice.frequency.exponentialRampToValueAtTime(pitch * 0.7, t + length);

  const warble = ctx.createOscillator();
  warble.type = "square";
  warble.frequency.setValueAtTime(19, t);
  warble.frequency.linearRampToValueAtTime(14, t + length);
  const warbleDepth = ctx.createGain();
  warbleDepth.gain.value = pitch * 0.35;
  warble.connect(warbleDepth).connect(voice.frequency);

  // The throat: a resonance that flutters with the warble, so it reads as "obble" rather than a buzz.
  const throat = ctx.createBiquadFilter();
  throat.type = "bandpass";
  throat.Q.value = 3;
  throat.frequency.value = pitch * 3;
  const flutter = ctx.createGain();
  flutter.gain.value = pitch * 1.4;
  warble.connect(flutter).connect(throat.frequency);

  voice.connect(throat).connect(envelope(out, t, 0.02, length, peak));
  voice.start(t);
  warble.start(t);
  voice.stop(t + length + 0.05);
  warble.stop(t + length + 0.05);
}

function gobble(ctx: AudioContext, t: number, out: AudioNode) {
  gobbleAt(ctx, t, out, 520, 0.65, 1.1);
}

/** The giant turkey's gobble: lower, longer, twice. */
function bigGobble(ctx: AudioContext, t: number, out: AudioNode) {
  gobbleAt(ctx, t, out, 300, 0.9, 1.6);
  gobbleAt(ctx, t + 0.95, out, 260, 0.8, 1.4);
}

/** A huge beak snapping shut: a low thump under a crunch, twice. */
function chomp(ctx: AudioContext, t: number, out: AudioNode) {
  [0, 0.22].forEach((offset) => {
    const start = t + offset;
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(180, start);
    thump.frequency.exponentialRampToValueAtTime(45, start + 0.2);
    thump.connect(envelope(out, start, 0.004, 0.25, 0.9));
    thump.start(start);
    thump.stop(start + 0.27);

    const crunch = ctx.createBufferSource();
    crunch.buffer = noiseBuffer(ctx, 0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.9;
    crunch.connect(filter).connect(envelope(out, start, 0.003, 0.16, 0.7));
    crunch.start(start);
  });
}

/** A dry leaf in a hand: a few crinkly bursts of bright noise. */
function rustle(ctx: AudioContext, t: number, out: AudioNode) {
  const buffer = noiseBuffer(ctx, 0.06);
  for (let i = 0; i < 6; i += 1) {
    const start = t + i * 0.035 + Math.random() * 0.015;
    const crinkle = ctx.createBufferSource();
    crinkle.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2500 + Math.random() * 2000;
    crinkle.connect(filter).connect(envelope(out, start, 0.003, 0.05, 0.3));
    crinkle.start(start);
  }
}

/** A pie eaten: three quick rising notes. */
function yum(ctx: AudioContext, t: number, out: AudioNode) {
  [880, 1109, 1319].forEach((frequency, i) => {
    const start = t + i * 0.08;
    const bell = ctx.createOscillator();
    bell.type = "triangle";
    bell.frequency.value = frequency;
    bell.connect(envelope(out, start, 0.005, 0.3, 0.25));
    bell.start(start);
    bell.stop(start + 0.35);
  });
}

/** An autumn gust: filtered noise that swells and sweeps up, then dies away. */
function wind(ctx: AudioContext, t: number, out: AudioNode) {
  const gust = ctx.createBufferSource();
  gust.buffer = noiseBuffer(ctx, 2.6);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.linearRampToValueAtTime(900, t + 1.2);
  filter.frequency.linearRampToValueAtTime(400, t + 2.5);
  gust.connect(filter).connect(envelope(out, t, 0.9, 2.5, 0.9));
  gust.start(t);
}

/** A dinner bell: a bright, ringing note struck three times. */
function bell(ctx: AudioContext, t: number, out: AudioNode) {
  [0, 0.28, 0.56].forEach((offset) => {
    const start = t + offset;
    [1568, 2350, 3920].forEach((frequency, i) => {
      const partial = ctx.createOscillator();
      partial.type = "sine";
      partial.frequency.value = frequency;
      partial.connect(envelope(out, start, 0.003, 0.9 - i * 0.2, 0.22 / (i + 1)));
      partial.start(start);
      partial.stop(start + 1);
    });
  });
}

/** A food-coma snore: a rumbly breath in, a sigh out, twice. */
function snore(ctx: AudioContext, t: number, out: AudioNode) {
  [0, 1.7].forEach((offset) => {
    const start = t + offset;
    const breath = ctx.createBufferSource();
    breath.buffer = noiseBuffer(ctx, 1.1);
    const throat = ctx.createBiquadFilter();
    throat.type = "lowpass";
    throat.frequency.value = 500;
    const rattle = ctx.createOscillator();
    rattle.frequency.value = 28;
    const rattleDepth = ctx.createGain();
    rattleDepth.gain.value = 260;
    rattle.connect(rattleDepth).connect(throat.frequency);
    breath.connect(throat).connect(envelope(out, start, 0.5, 1.05, 0.8));
    breath.start(start);
    rattle.start(start);
    rattle.stop(start + 1.1);

    const sigh = ctx.createBufferSource();
    sigh.buffer = noiseBuffer(ctx, 0.6);
    const air = ctx.createBiquadFilter();
    air.type = "bandpass";
    air.frequency.value = 1200;
    sigh.connect(air).connect(envelope(out, start + 1.1, 0.1, 0.55, 0.25));
    sigh.start(start + 1.1);
  });
}

/** Gravy pouring: a few low, wet bubbles. */
function glug(ctx: AudioContext, t: number, out: AudioNode) {
  for (let i = 0; i < 5; i += 1) {
    const start = t + i * 0.16 + Math.random() * 0.04;
    const bubble = ctx.createOscillator();
    bubble.type = "sine";
    bubble.frequency.setValueAtTime(140 + Math.random() * 60, start);
    bubble.frequency.exponentialRampToValueAtTime(420 + Math.random() * 120, start + 0.09);
    bubble.connect(envelope(out, start, 0.005, 0.12, 0.6));
    bubble.start(start);
    bubble.stop(start + 0.14);
  }
}

/** A pardon: a short brass "ta-da-daaa". */
function fanfare(ctx: AudioContext, t: number, out: AudioNode) {
  const notes: readonly (readonly [number, number, number])[] = [
    [523, 0, 0.14],
    [659, 0.15, 0.14],
    [784, 0.3, 0.7]
  ];
  notes.forEach(([frequency, offset, length]) => {
    const start = t + offset;
    const horn = ctx.createOscillator();
    horn.type = "sawtooth";
    horn.frequency.value = frequency;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    horn.connect(tone).connect(envelope(out, start, 0.02, length, 0.35));
    horn.start(start);
    horn.stop(start + length + 0.05);
  });
}

/** A wishbone breaking: one dry crack. */
function snap(ctx: AudioContext, t: number, out: AudioNode) {
  const crack = ctx.createBufferSource();
  crack.buffer = noiseBuffer(ctx, 0.08);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1500;
  crack.connect(filter).connect(envelope(out, t, 0.002, 0.07, 1));
  crack.start(t);
}

const PLAYERS: Record<HarvestSound, (ctx: AudioContext, t: number, out: AudioNode) => void> = {
  gobble,
  bigGobble,
  chomp,
  rustle,
  yum,
  wind,
  bell,
  snore,
  glug,
  fanfare,
  snap
};

/** `volume` scales the sound (1 for clicks, lower for visitors arriving on their own). */
export function playHarvestSound(sound: HarvestSound, volume = 1) {
  playThrough(volume, PLAYERS[sound]);
}
