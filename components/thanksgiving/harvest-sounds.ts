/**
 * Thanksgiving sound effects, synthesized like the Halloween ones (and played through the same
 * audio context, components/halloween/spooky-sounds.ts), so there are no audio files to ship.
 */

import { envelope, noiseBuffer, playThrough } from "@/components/halloween/spooky-sounds";

export type HarvestSound = "gobble" | "bigGobble" | "chomp" | "rustle" | "yum" | "wind";

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

const PLAYERS: Record<HarvestSound, (ctx: AudioContext, t: number, out: AudioNode) => void> = {
  gobble,
  bigGobble,
  chomp,
  rustle,
  yum,
  wind
};

/** `volume` scales the sound (1 for clicks, lower for visitors arriving on their own). */
export function playHarvestSound(sound: HarvestSound, volume = 1) {
  playThrough(volume, PLAYERS[sound]);
}
