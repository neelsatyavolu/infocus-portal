/**
 * Halloween sound effects, synthesized with Web Audio so there are no audio files to ship or
 * license. Browsers keep audio locked until the person clicks or presses a key on the page, so
 * unlockSpookySounds() runs on that first gesture (halloween-music.tsx); visitors that arrive
 * before it stay silent.
 */

export type SpookySound = "splat" | "boo" | "cackle" | "scurry" | "creak" | "flap";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  context ??= new window.AudioContext();
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

/** Call from a click or key press: creates or resumes the audio context while the browser allows it. */
export function unlockSpookySounds(): AudioContext | null {
  return audio();
}

/** The shared audio context once it is unlocked and running (the music plays through it too). */
export function runningSpookyAudio(): AudioContext | null {
  return context?.state === "running" ? context : null;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A gain node that rises to `peak` and falls back to silence over `length` seconds. */
function envelope(out: AudioNode, start: number, attack: number, length: number, peak: number): GainNode {
  const gain = out.context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  gain.connect(out);
  return gain;
}

/** A pumpkin hitting the floor: a low thump under a wet burst of noise. */
function splat(ctx: AudioContext, t: number, out: AudioNode) {
  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(140, t);
  thump.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  thump.connect(envelope(out, t, 0.005, 0.3, 0.5));
  thump.start(t);
  thump.stop(t + 0.32);

  const squish = ctx.createBufferSource();
  squish.buffer = noiseBuffer(ctx, 0.4);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, t);
  filter.frequency.exponentialRampToValueAtTime(300, t + 0.35);
  squish.connect(filter).connect(envelope(out, t, 0.01, 0.38, 0.35));
  squish.start(t);
}

/** A ghost's "wooOOooo": a wavering tone that swells and slides down. */
function boo(ctx: AudioContext, t: number, out: AudioNode) {
  const voice = ctx.createOscillator();
  voice.type = "triangle";
  voice.frequency.setValueAtTime(330, t);
  voice.frequency.linearRampToValueAtTime(420, t + 0.4);
  voice.frequency.exponentialRampToValueAtTime(190, t + 1.4);

  const wobble = ctx.createOscillator();
  wobble.frequency.value = 6;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 14;
  wobble.connect(wobbleDepth).connect(voice.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  voice.connect(filter).connect(envelope(out, t, 0.35, 1.5, 0.28));
  voice.start(t);
  wobble.start(t);
  voice.stop(t + 1.55);
  wobble.stop(t + 1.55);
}

/** A witch's "heh-heh-heh-heh": short nasal bursts, each a little lower. */
function cackle(ctx: AudioContext, t: number, out: AudioNode) {
  for (let i = 0; i < 7; i += 1) {
    const start = t + i * 0.12;
    const voice = ctx.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(760 - i * 45, start);
    voice.frequency.exponentialRampToValueAtTime(520 - i * 35, start + 0.09);
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 1400;
    formant.Q.value = 4;
    voice.connect(formant).connect(envelope(out, start, 0.01, 0.1, 0.9));
    voice.start(start);
    voice.stop(start + 0.11);
  }
}

/** Eight legs on a desk: quick dry ticks. */
function scurry(ctx: AudioContext, t: number, out: AudioNode) {
  const buffer = noiseBuffer(ctx, 0.03);
  for (let i = 0; i < 14; i += 1) {
    const start = t + i * 0.032 + Math.random() * 0.01;
    const tick = ctx.createBufferSource();
    tick.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 3000;
    tick.connect(filter).connect(envelope(out, start, 0.002, 0.025, 0.25));
    tick.start(start);
  }
}

/** A slow door hinge: a rough low tone with a sweeping, jittery resonance. */
function creak(ctx: AudioContext, t: number, out: AudioNode) {
  const hinge = ctx.createOscillator();
  hinge.type = "sawtooth";
  for (let i = 0; i <= 20; i += 1) hinge.frequency.setValueAtTime(70 + Math.random() * 35, t + i * 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(700, t);
  filter.frequency.linearRampToValueAtTime(1600, t + 1);
  hinge.connect(filter).connect(envelope(out, t, 0.15, 1.05, 1.6));
  hinge.start(t);
  hinge.stop(t + 1.1);
}

/** Bat wings: three soft whooshes. */
function flap(ctx: AudioContext, t: number, out: AudioNode) {
  const buffer = noiseBuffer(ctx, 0.12);
  for (let i = 0; i < 3; i += 1) {
    const start = t + i * 0.11;
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.8;
    whoosh.connect(filter).connect(envelope(out, start, 0.03, 0.1, 2));
    whoosh.start(start);
  }
}

const PLAYERS: Record<SpookySound, (ctx: AudioContext, t: number, out: AudioNode) => void> = {
  splat,
  boo,
  cackle,
  scurry,
  creak,
  flap
};

/** `volume` scales the sound (1 for clicks, lower for visitors arriving on their own). */
export function playSpookySound(sound: SpookySound, volume = 1) {
  const ctx = audio();
  if (!ctx) return;
  // Still locked and not inside a click or key press: skip it rather than queue it for later.
  if (ctx.state !== "running" && !navigator.userActivation?.isActive) return;
  try {
    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);
    PLAYERS[sound](ctx, ctx.currentTime + 0.01, out);
  } catch {
    // A sound effect is never worth an error on the page.
  }
}
