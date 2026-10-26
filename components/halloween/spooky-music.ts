/**
 * Halloween background music: an original music-box tune in D minor over a low drone, played
 * live with Web Audio (no audio files). The loop is 8 bars: the arpeggio throughout, a high
 * melody on the second half, a bell on each new loop. halloween-goodies.tsx starts and stops it.
 */

const STEP_S = 60 / 76 / 2; // eighth notes at 76 bpm
const STEPS_PER_BAR = 8;
const STEPS_PER_LOOP = STEPS_PER_BAR * 8;
const MUSIC_VOLUME = 0.35;
const LOOKAHEAD_S = 0.4;
const TICK_MS = 120;

type Bar = { drone: [number, number]; arpeggio: number[]; melody: (number | null)[] };

/** i – VI – iv – V in D minor (MIDI note numbers). */
const BARS: Bar[] = [
  { drone: [38, 45], arpeggio: [69, 74, 77, 81, 80, 81, 77, 74], melody: [86, null, 85, null, 86, null, 81, null] },
  { drone: [34, 41], arpeggio: [70, 74, 77, 82, 81, 77, 74, 70], melody: [89, null, 88, null, 86, null, null, null] },
  { drone: [43, 50], arpeggio: [67, 70, 74, 79, 78, 79, 74, 70], melody: [82, null, 81, null, 79, null, 74, null] },
  { drone: [45, 52], arpeggio: [69, 73, 76, 81, 79, 76, 73, 69], melody: [85, null, 88, null, 81, null, null, null] }
];

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type Music = { ctx: AudioContext; bus: GainNode; echo: AudioNode; step: number; nextTime: number; timer: number };

let music: Music | null = null;

/** A music-box tine: a sine and a quieter octave, struck and left to ring. */
function tine(m: Music, midi: number, time: number, peak: number) {
  const gain = m.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
  gain.connect(m.bus);
  gain.connect(m.echo);
  const octave = m.ctx.createGain();
  octave.gain.value = 0.25;
  octave.connect(gain);
  const base = m.ctx.createOscillator();
  base.frequency.value = frequency(midi);
  base.connect(gain);
  const upper = m.ctx.createOscillator();
  upper.type = "triangle";
  upper.frequency.value = frequency(midi) * 2.003;
  upper.connect(octave);
  for (const osc of [base, upper]) {
    osc.start(time);
    osc.stop(time + 1.45);
  }
}

/** Two slightly detuned saws under a slow, dark filter, held for one bar. */
function drone(m: Music, notes: [number, number], time: number) {
  const length = STEP_S * STEPS_PER_BAR;
  const filter = m.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(320, time);
  filter.frequency.linearRampToValueAtTime(620, time + length / 2);
  filter.frequency.linearRampToValueAtTime(320, time + length);
  filter.Q.value = 3;
  const gain = m.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.09, time + 0.8);
  gain.gain.setValueAtTime(0.09, time + length - 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length + 0.9);
  filter.connect(gain).connect(m.bus);
  notes.forEach((note, index) => {
    const osc = m.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency(note);
    osc.detune.value = index === 0 ? -5 : 5;
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + length + 1);
  });
}

/** A distant church bell: inharmonic partials with a long fade. */
function bell(m: Music, midi: number, time: number) {
  [1, 2.4, 3.9, 5.4].forEach((ratio, index) => {
    const gain = m.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.18 / (index + 1), time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 4.5 / (index + 1));
    gain.connect(m.bus);
    gain.connect(m.echo);
    const osc = m.ctx.createOscillator();
    osc.frequency.value = frequency(midi) * ratio;
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + 4.6);
  });
}

/** A dotted-eighth echo that fades and darkens, so the tune sounds like it is in a big empty room. */
function makeEcho(ctx: AudioContext, out: AudioNode): AudioNode {
  const input = ctx.createGain();
  input.gain.value = 0.5;
  const delay = ctx.createDelay(2);
  delay.delayTime.value = STEP_S * 1.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2200;
  input.connect(delay).connect(tone).connect(feedback).connect(delay);
  tone.connect(out);
  return input;
}

function schedule() {
  const m = music;
  if (!m) return;
  while (m.nextTime < m.ctx.currentTime + LOOKAHEAD_S) {
    const loopStep = m.step % STEPS_PER_LOOP;
    const bar = BARS[Math.floor(loopStep / STEPS_PER_BAR) % BARS.length];
    const beat = loopStep % STEPS_PER_BAR;
    if (loopStep === 0) bell(m, 50, m.nextTime);
    if (beat === 0) drone(m, bar.drone, m.nextTime);
    tine(m, bar.arpeggio[beat], m.nextTime, 0.16);
    const note = bar.melody[beat];
    if (loopStep >= STEPS_PER_LOOP / 2 && note !== null) tine(m, note, m.nextTime, 0.22);
    m.step += 1;
    m.nextTime += STEP_S;
  }
}

/** Starts the loop (fading in) on a running audio context. Does nothing if it is already playing. */
export function startSpookyMusic(ctx: AudioContext) {
  if (music || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, now);
  bus.gain.exponentialRampToValueAtTime(MUSIC_VOLUME, now + 2);
  bus.connect(ctx.destination);
  music = { ctx, bus, echo: makeEcho(ctx, bus), step: 0, nextTime: now + 0.1, timer: window.setInterval(schedule, TICK_MS) };
  schedule();
}

/** Fades the loop out over half a second and stops scheduling notes. */
export function stopSpookyMusic() {
  const m = music;
  if (!m) return;
  music = null;
  window.clearInterval(m.timer);
  const now = m.ctx.currentTime;
  m.bus.gain.cancelScheduledValues(now);
  m.bus.gain.setValueAtTime(Math.max(m.bus.gain.value, 0.0001), now);
  m.bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  window.setTimeout(() => m.bus.disconnect(), 700);
}
