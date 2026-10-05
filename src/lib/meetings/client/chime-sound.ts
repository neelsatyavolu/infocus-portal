import { sharedAudioContext } from "./audio-context";
import type { ChimeKind } from "./chimes";

/**
 * Soft synthesized chimes (WebAudio, no audio files). Join: two rising sine notes; leave: a
 * softer, lower falling pair. Routed through an <audio> element so setSinkId can pick the
 * chosen speaker; falls back to the default output.
 */

type Note = { freq: number; at: number; duration: number };

const SOUNDS: Record<ChimeKind, { type: OscillatorType; gain: number; notes: Note[] }> = {
  join: {
    type: "sine",
    gain: 0.06,
    notes: [
      { freq: 659.25, at: 0, duration: 0.12 },
      { freq: 880, at: 0.09, duration: 0.14 }
    ]
  },
  leave: {
    type: "triangle",
    gain: 0.035,
    notes: [
      { freq: 440, at: 0, duration: 0.12 },
      { freq: 329.63, at: 0.09, duration: 0.15 }
    ]
  }
};

let context: AudioContext | null = null;
let destination: MediaStreamAudioDestinationNode | null = null;
let element: (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null = null;

/** Chimes play on the page's shared AudioContext (no context of their own). */
function output() {
  const shared = sharedAudioContext();
  if (context !== shared || !destination) {
    context = shared;
    destination = context.createMediaStreamDestination();
    element = new Audio();
    element.srcObject = destination.stream;
  }
  return { context, destination: destination!, element: element! };
}

export async function playChime(kind: ChimeKind, sinkId: string) {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  const { context: ctx, destination: dest, element: el } = output();
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
  if (el.setSinkId && sinkId) await el.setSinkId(sinkId).catch(() => undefined);
  void el.play().catch(() => undefined);

  const sound = SOUNDS[kind];
  const start = ctx.currentTime + 0.01;
  for (const note of sound.notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = sound.type;
    osc.frequency.value = note.freq;
    const t0 = start + note.at;
    // Short attack, smooth exponential release: no clicks.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(sound.gain, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.duration);
    osc.connect(gain).connect(dest);
    osc.start(t0);
    osc.stop(t0 + note.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
