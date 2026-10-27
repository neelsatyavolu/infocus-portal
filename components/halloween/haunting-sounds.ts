/**
 * Sounds for the hauntings (halloween-hauntings.tsx): one for each thing that happens to the page,
 * and eight that play on their own in the dark. All synthesized with Web Audio, like the rest.
 */

import { envelope, noiseBuffer, playSpookySound, playThrough } from "./spooky-sounds";

export type HauntSound =
  | "buzz"
  | "lightsOut"
  | "drip"
  | "glass"
  | "whisper"
  | "static"
  | "crack"
  | "whoosh"
  | "heartbeat"
  | "knock"
  | "creak"
  | "scrape"
  | "scratch"
  | "giggle"
  | "wind"
  | "squeak"
  | "footsteps"
  | "howl"
  | "thunder"
  | "scream"
  | "chains"
  | "musicBox"
  | "doorSlam"
  | "breath";

type Play = (ctx: AudioContext, t: number, out: AudioNode) => void;

/** Sends sound to a place between the left (-1) and right (1) speaker. */
function panned(out: AudioNode, pan: number): AudioNode {
  const panner = out.context.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(out);
  return panner;
}

/** A far-off room: the sound and a fading echo of it. */
function echoing(out: AudioNode, delay = 0.28, feedback = 0.38): AudioNode {
  const ctx = out.context;
  const input = ctx.createGain();
  const echo = ctx.createDelay(1);
  echo.delayTime.value = delay;
  const loop = ctx.createGain();
  loop.gain.value = feedback;
  input.connect(out);
  input.connect(echo).connect(loop).connect(echo);
  loop.connect(out);
  return input;
}

/** Filtered noise through an envelope: the base of most of these. */
function noise(ctx: AudioContext, out: AudioNode, t: number, length: number, type: BiquadFilterType, frequency: number, q: number, peak: number) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, length + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  source.connect(filter).connect(envelope(out, t, Math.min(0.01, length / 4), length, peak));
  source.start(t);
  return filter;
}

function thump(ctx: AudioContext, out: AudioNode, t: number, pitch: number, peak: number) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(pitch, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + 0.15);
  osc.connect(envelope(out, t, 0.004, 0.2, peak));
  osc.start(t);
  osc.stop(t + 0.22);
  noise(ctx, out, t, 0.08, "lowpass", 700, 1, peak * 0.6);
}

function tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, from: number, to: number, length: number, peak: number) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + length);
  osc.connect(envelope(out, t, Math.min(0.02, length / 4), length, peak));
  osc.start(t);
  osc.stop(t + length + 0.02);
  return osc;
}

/** Wobbles `param` by `depth` at `rate` Hz from `t` for `length` seconds. */
function vibrato(ctx: AudioContext, param: AudioParam, t: number, length: number, rate: number, depth: number) {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  lfo.start(t);
  lfo.stop(t + length);
}

const SOUNDS: Record<Exclude<HauntSound, "creak">, Play> = {
  /** A failing fluorescent tube. */
  buzz(ctx, t, out) {
    [0, 0.35, 0.8].forEach((offset, i) => {
      const hum = tone(ctx, out, t + offset, "sawtooth", 120, 118, 0.22 + i * 0.05, 0.12);
      hum.frequency.value = 120;
      noise(ctx, out, t + offset, 0.05, "highpass", 4000, 1, 0.3);
    });
  },
  /** The switch, then a low hum in the dark. */
  lightsOut(ctx, t, out) {
    noise(ctx, out, t, 0.03, "highpass", 2500, 1, 0.6);
    tone(ctx, out, t + 0.05, "sine", 55, 50, 3.6, 0.35);
    tone(ctx, out, t + 0.05, "sine", 110, 104, 3.6, 0.12);
  },
  drip(ctx, t, out) {
    [0, 0.5, 0.8, 1.4, 1.9].forEach((offset) => tone(ctx, out, t + offset, "sine", 1400 + Math.random() * 400, 380, 0.12, 0.3));
  },
  /** Hands slapping a window, one after another. */
  glass(ctx, t, out) {
    for (let i = 0; i < 5; i += 1) {
      const at = t + i * 0.45;
      thump(ctx, panned(out, -0.8 + i * 0.4), at, 140, 0.6);
      tone(ctx, panned(out, -0.8 + i * 0.4), at + 0.04, "sine", 2400, 1900, 0.08, 0.05);
    }
  },
  /** Breathy syllables passing from one ear to the other. */
  whisper(ctx, t, out) {
    const pan = out.context.createStereoPanner();
    pan.pan.setValueAtTime(-0.9, t);
    pan.pan.linearRampToValueAtTime(0.9, t + 2.2);
    pan.connect(out);
    for (let i = 0; i < 9; i += 1) {
      const at = t + i * 0.24 + Math.random() * 0.05;
      const filter = noise(ctx, pan, at, 0.18, "bandpass", 1800 + Math.random() * 1600, 4, 0.5);
      filter.frequency.exponentialRampToValueAtTime(900 + Math.random() * 700, at + 0.18);
    }
  },
  static(ctx, t, out) {
    noise(ctx, out, t, 0.9, "bandpass", 3000, 0.4, 0.45);
    for (let i = 0; i < 10; i += 1) noise(ctx, out, t + Math.random() * 0.85, 0.02, "highpass", 5000, 1, 0.5);
  },
  /** A window cracking: a snap, splintering ticks, glass settling. */
  crack(ctx, t, out) {
    noise(ctx, out, t, 0.06, "highpass", 1800, 1, 1);
    thump(ctx, out, t, 90, 0.5);
    for (let i = 0; i < 12; i += 1) noise(ctx, out, t + 0.05 + Math.random() * 0.4, 0.015, "highpass", 6000, 1, 0.4);
    for (let i = 0; i < 4; i += 1) tone(ctx, out, t + 0.3 + i * 0.12, "sine", 3200 + Math.random() * 2000, 3000, 0.25, 0.03);
  },
  /** Something rushing past, left to right. */
  whoosh(ctx, t, out) {
    const pan = out.context.createStereoPanner();
    pan.pan.setValueAtTime(-1, t);
    pan.pan.linearRampToValueAtTime(1, t + 1.3);
    pan.connect(out);
    const filter = noise(ctx, pan, t, 1.3, "bandpass", 250, 1.5, 0.9);
    filter.frequency.exponentialRampToValueAtTime(1300, t + 0.6);
    filter.frequency.exponentialRampToValueAtTime(220, t + 1.3);
    tone(ctx, out, t, "sine", 70, 45, 1.3, 0.25);
  },
  /** Four heartbeats, louder each time. */
  heartbeat(ctx, t, out) {
    for (let beat = 0; beat < 4; beat += 1) {
      const at = t + beat * 0.8;
      const peak = 0.4 + beat * 0.18;
      tone(ctx, out, at, "sine", 65, 35, 0.16, peak);
      tone(ctx, out, at + 0.2, "sine", 55, 32, 0.16, peak * 0.7);
    }
  },
  /** Three knocks on a wooden door. */
  knock(ctx, t, out) {
    [0, 0.35, 0.7].forEach((offset) => {
      thump(ctx, out, t + offset, 120, 0.9);
      noise(ctx, out, t + offset, 0.12, "bandpass", 320, 6, 0.6);
    });
  },
  /** Furniture dragged across a floor upstairs. */
  scrape(ctx, t, out) {
    const filter = noise(ctx, echoing(out, 0.18, 0.25), t, 1.8, "bandpass", 380, 8, 0.8);
    for (let i = 0; i <= 18; i += 1) filter.frequency.setValueAtTime(300 + Math.random() * 180, t + i * 0.1);
  },
  /** Three claws dragged down glass. */
  scratch(ctx, t, out) {
    for (let i = 0; i < 3; i += 1) {
      const at = t + i * 0.12;
      const filter = noise(ctx, out, at, 0.32, "bandpass", 2600, 3, 0.55);
      filter.frequency.exponentialRampToValueAtTime(1400, at + 0.3);
      tone(ctx, out, at, "sawtooth", 3100, 2500, 0.3, 0.03);
    }
  },
  /** A small, far-off giggle. */
  giggle(ctx, t, out) {
    const room = echoing(out, 0.22, 0.3);
    for (let i = 0; i < 6; i += 1) {
      const at = t + i * 0.13;
      const osc = tone(ctx, room, at, "triangle", 1150 - i * 45, 900 - i * 40, 0.1, 0.18);
      vibrato(ctx, osc.frequency, at, 0.1, 30, 40);
    }
  },
  /** Wind through a gap in the window. */
  wind(ctx, t, out) {
    const filter = noise(ctx, out, t, 4.5, "bandpass", 500, 3, 0.5);
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(900, t + 1.6);
    filter.frequency.linearRampToValueAtTime(350, t + 3);
    filter.frequency.linearRampToValueAtTime(700, t + 4.5);
  },
  /** A fingertip squeaking across a fogged-up window. */
  squeak(ctx, t, out) {
    for (let i = 0; i < 6; i += 1) {
      const at = t + 0.3 + i * 0.42;
      const osc = tone(ctx, out, at, "sine", 1900 + Math.random() * 500, 2300 + Math.random() * 500, 0.3, 0.06);
      vibrato(ctx, osc.frequency, at, 0.3, 22, 60);
    }
  },
  /** Slow footsteps coming closer from the left. */
  footsteps(ctx, t, out) {
    for (let i = 0; i < 7; i += 1) {
      const at = t + i * 0.62;
      const where = panned(out, -1 + i * 0.25);
      thump(ctx, where, at, 75, 0.25 + i * 0.12);
      noise(ctx, where, at + 0.02, 0.1, "bandpass", 900, 2, 0.08 + i * 0.03);
    }
  },
  /** A wolf, far away. */
  howl(ctx, t, out) {
    const room = echoing(out, 0.35, 0.4);
    const voice = ctx.createOscillator();
    voice.type = "triangle";
    voice.frequency.setValueAtTime(300, t);
    voice.frequency.exponentialRampToValueAtTime(620, t + 0.7);
    voice.frequency.linearRampToValueAtTime(560, t + 2.2);
    voice.frequency.exponentialRampToValueAtTime(330, t + 3);
    vibrato(ctx, voice.frequency, t, 3, 5, 8);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    voice.connect(filter).connect(envelope(room, t, 0.5, 3, 0.4));
    voice.start(t);
    voice.stop(t + 3.05);
  },
  thunder(ctx, t, out) {
    noise(ctx, out, t, 0.25, "lowpass", 3000, 0.7, 0.7);
    const rumble = noise(ctx, out, t + 0.1, 4, "lowpass", 400, 0.7, 1);
    rumble.frequency.exponentialRampToValueAtTime(90, t + 4);
    for (let i = 0; i < 5; i += 1) noise(ctx, out, t + 0.4 + Math.random() * 2.5, 0.5, "lowpass", 250, 1, 0.6);
  },
  /** A scream from somewhere else in the building. */
  scream(ctx, t, out) {
    const room = echoing(panned(out, Math.random() < 0.5 ? -0.7 : 0.7), 0.3, 0.45);
    const voice = ctx.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(650, t);
    voice.frequency.exponentialRampToValueAtTime(1150, t + 0.25);
    voice.frequency.linearRampToValueAtTime(980, t + 1.2);
    voice.frequency.exponentialRampToValueAtTime(600, t + 1.6);
    vibrato(ctx, voice.frequency, t, 1.6, 7, 35);
    const mouth = ctx.createBiquadFilter();
    mouth.type = "bandpass";
    mouth.frequency.value = 1500;
    mouth.Q.value = 3;
    const far = ctx.createBiquadFilter();
    far.type = "lowpass";
    far.frequency.value = 2200;
    voice.connect(mouth).connect(far).connect(envelope(room, t, 0.08, 1.6, 0.6));
    voice.start(t);
    voice.stop(t + 1.65);
  },
  /** Chains dragged and shaken. */
  chains(ctx, t, out) {
    for (let i = 0; i < 22; i += 1) {
      const at = t + Math.random() * 1.6;
      noise(ctx, out, at, 0.04, "bandpass", 2500 + Math.random() * 3000, 12, 0.5);
      tone(ctx, out, at, "triangle", 3800 + Math.random() * 1500, 3600, 0.15, 0.025);
    }
  },
  /** A music box, slowly winding down. */
  musicBox(ctx, t, out) {
    const room = echoing(out, 0.25, 0.3);
    [76, 79, 83, 81, 79, 78, 76, 75, 76].forEach((midi, i) => {
      const at = t + i * (0.32 + i * 0.03);
      const pitch = 440 * 2 ** ((midi - 69) / 12) * (1 - i * 0.004);
      tone(ctx, room, at, "sine", pitch, pitch * 0.995, 0.6, 0.16);
      tone(ctx, room, at, "triangle", pitch * 2, pitch * 1.99, 0.25, 0.04);
    });
  },
  /** A door creaks, then slams somewhere in the house. */
  doorSlam(ctx, t, out) {
    playSpookySound("creak", 0.7);
    const room = echoing(out, 0.2, 0.3);
    thump(ctx, room, t + 1.05, 70, 1);
    noise(ctx, room, t + 1.05, 0.3, "lowpass", 900, 0.8, 0.8);
  },
  /** Slow breathing, right behind you. */
  breath(ctx, t, out) {
    [0, 1.9].forEach((offset) => {
      const inhale = noise(ctx, out, t + offset, 0.9, "bandpass", 700, 1.5, 0.35);
      inhale.frequency.linearRampToValueAtTime(1100, t + offset + 0.9);
      const exhale = noise(ctx, out, t + offset + 0.95, 0.85, "bandpass", 900, 1.2, 0.3);
      exhale.frequency.linearRampToValueAtTime(500, t + offset + 1.8);
    });
  }
};

export function playHauntSound(sound: HauntSound, volume: number) {
  if (sound === "creak") {
    playSpookySound("creak", volume);
    return;
  }
  playThrough(volume, SOUNDS[sound]);
}
