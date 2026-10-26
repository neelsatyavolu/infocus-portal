/**
 * Sounds for the big BOOs (halloween-scare.tsx), one per variant, built from a few shared parts.
 * Each runs through a compressor so it lands loud without distorting.
 */

import { envelope, noiseBuffer, playThrough } from "./spooky-sounds";

export type ScareVariant = "ghost" | "pumpkin" | "spider" | "eyes" | "bats";

/** The eyes variant waits in the dark this long before its BOO (the visual matches it). */
export const EYES_BOO_DELAY_S = 0.95;

function boom(ctx: AudioContext, t: number, out: AudioNode, peak: number) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.7);
  osc.connect(envelope(out, t, 0.004, 0.8, peak));
  osc.start(t);
  osc.stop(t + 0.82);

  const hit = ctx.createBufferSource();
  hit.buffer = noiseBuffer(ctx, 0.5);
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(5000, t);
  tone.frequency.exponentialRampToValueAtTime(200, t + 0.45);
  hit.connect(tone).connect(envelope(out, t, 0.003, 0.5, peak * 0.65));
  hit.start(t);
}

/** Dissonant sawtooth notes bending up: the horror-movie violin stab. */
function screech(ctx: AudioContext, t: number, out: AudioNode, pitches: number[], peak: number) {
  pitches.forEach((pitch) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.12, t + 0.9);
    const edge = ctx.createBiquadFilter();
    edge.type = "bandpass";
    edge.frequency.value = Math.min(pitch * 2, 4000);
    edge.Q.value = 0.9;
    osc.connect(edge).connect(envelope(out, t, 0.01, 1, peak));
    osc.start(t);
    osc.stop(t + 1.05);
  });
}

/** "BOOOO": a low buzzy voice through an "oo" vowel filter, sliding down with a growl. */
function growl(ctx: AudioContext, t: number, out: AudioNode, peak: number) {
  const voice = ctx.createOscillator();
  voice.type = "sawtooth";
  voice.frequency.setValueAtTime(210, t);
  voice.frequency.exponentialRampToValueAtTime(95, t + 1.25);
  const rumble = ctx.createOscillator();
  rumble.frequency.value = 28;
  const depth = ctx.createGain();
  depth.gain.value = 12;
  rumble.connect(depth).connect(voice.frequency);
  const vowel = ctx.createBiquadFilter();
  vowel.type = "lowpass";
  vowel.frequency.value = 700;
  vowel.Q.value = 6;
  voice.connect(vowel).connect(envelope(out, t, 0.06, 1.35, peak));
  for (const osc of [voice, rumble]) {
    osc.start(t);
    osc.stop(t + 1.4);
  }
}

/** A deep "HA HA HA HA": low voiced bursts with an "ah" formant, each a little lower. */
function laugh(ctx: AudioContext, t: number, out: AudioNode, peak: number) {
  for (let i = 0; i < 5; i += 1) {
    const start = t + i * 0.2;
    const voice = ctx.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(150 - i * 8, start);
    voice.frequency.exponentialRampToValueAtTime(115 - i * 8, start + 0.16);
    const vowel = ctx.createBiquadFilter();
    vowel.type = "bandpass";
    vowel.frequency.value = 750;
    vowel.Q.value = 2.5;
    voice.connect(vowel).connect(envelope(out, start, 0.015, 0.17, peak));
    voice.start(start);
    voice.stop(start + 0.18);
  }
}

/** A hiss that swells, like something big about to strike. */
function hiss(ctx: AudioContext, t: number, out: AudioNode, length: number, peak: number) {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, length + 0.1);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(2500, t);
  filter.frequency.linearRampToValueAtTime(5000, t + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + length);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.08);
  gain.connect(out);
  noise.connect(filter).connect(gain);
  noise.start(t);
}

/** Two "lub-dub" heartbeats. */
function heartbeat(ctx: AudioContext, t: number, out: AudioNode, peak: number) {
  [0, 0.2, 0.55, 0.75].forEach((offset, index) => {
    const start = t + offset;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(index % 2 ? 55 : 65, start);
    osc.frequency.exponentialRampToValueAtTime(35, start + 0.15);
    osc.connect(envelope(out, start, 0.008, 0.18, index % 2 ? peak * 0.7 : peak));
    osc.start(start);
    osc.stop(start + 0.2);
  });
}

/** High bat squeaks over a rush of wings. */
function swarm(ctx: AudioContext, t: number, out: AudioNode, peak: number) {
  for (let i = 0; i < 12; i += 1) {
    const start = t + Math.random() * 0.7;
    const squeak = ctx.createOscillator();
    const pitch = 3500 + Math.random() * 3000;
    squeak.frequency.setValueAtTime(pitch, start);
    squeak.frequency.exponentialRampToValueAtTime(pitch * 1.3, start + 0.05);
    squeak.connect(envelope(out, start, 0.005, 0.06, peak * 0.5));
    squeak.start(start);
    squeak.stop(start + 0.07);
  }
  const wings = noiseBuffer(ctx, 0.12);
  for (let i = 0; i < 10; i += 1) {
    const start = t + i * 0.07;
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = wings;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 400 + Math.random() * 400;
    filter.Q.value = 0.8;
    whoosh.connect(filter).connect(envelope(out, start, 0.02, 0.1, peak));
    whoosh.start(start);
  }
}

const VARIANTS: Record<ScareVariant, (ctx: AudioContext, t: number, out: AudioNode) => void> = {
  ghost(ctx, t, out) {
    boom(ctx, t, out, 0.75);
    screech(ctx, t, out, [1046, 1108, 1480], 0.35);
    growl(ctx, t + 0.05, out, 0.9);
  },
  pumpkin(ctx, t, out) {
    boom(ctx, t, out, 0.75);
    screech(ctx, t, out, [220, 233], 0.3);
    laugh(ctx, t + 0.12, out, 1.6);
  },
  spider(ctx, t, out) {
    hiss(ctx, t, out, 0.35, 0.5);
    boom(ctx, t + 0.35, out, 0.7);
    screech(ctx, t + 0.35, out, [1318, 1396, 1975], 0.35);
  },
  eyes(ctx, t, out) {
    heartbeat(ctx, t, out, 0.9);
    const boo = t + EYES_BOO_DELAY_S;
    boom(ctx, boo, out, 0.75);
    screech(ctx, boo, out, [1046, 1108, 1480], 0.35);
    growl(ctx, boo + 0.05, out, 0.8);
  },
  bats(ctx, t, out) {
    swarm(ctx, t, out, 0.7);
    boom(ctx, t, out, 0.7);
    screech(ctx, t, out, [1760, 1865], 0.25);
  }
};

export function playScareSound(variant: ScareVariant, volume: number) {
  playThrough(volume, (ctx, t, out) => {
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -12;
    squash.ratio.value = 6;
    squash.attack.value = 0.002;
    squash.release.value = 0.25;
    squash.connect(out);
    VARIANTS[variant](ctx, t, squash);
  });
}
