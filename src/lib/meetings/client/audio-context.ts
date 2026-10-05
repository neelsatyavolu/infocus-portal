import { diagEvent } from "./diagnostics";

/**
 * The page's ONE AudioContext for Meetings: level meters, join/leave chimes and voice isolation
 * (RNNoise) all share it. Browsers cap concurrent AudioContexts and each one is an audio thread;
 * several at once (and one per mic re-acquisition, as before) can starve or garble audio.
 *
 * It asks for 48 kHz (RNNoise's rate). Voice isolation still checks the rate it actually got
 * (and the mic's) before running; meters and chimes work at any rate.
 */

export const SHARED_SAMPLE_RATE = 48_000;

type ContextFactory = () => AudioContext;

let factory: ContextFactory = () => new AudioContext({ sampleRate: SHARED_SAMPLE_RATE });
let shared: AudioContext | null = null;
let created = 0;

/** The shared context, created on first use (and again only if it was closed). */
export function sharedAudioContext(): AudioContext {
  if (shared && shared.state !== "closed") return shared;
  const context = factory();
  created += 1;
  shared = context;
  // Suspended/interrupted (iOS phone call, Siri, another app taking audio) silence everything
  // that runs through it, including voice-isolated mic audio: worth knowing after the fact.
  context.addEventListener?.("statechange", () => {
    diagEvent("audio_context", { state: context.state, rate: context.sampleRate });
  });
  return context;
}

/** Call from a click/tap (join, unmute, "Tap to start audio"): resumes a suspended context. */
export function resumeSharedAudio() {
  if (!shared || shared.state === "closed" || shared.state === "running") return;
  void shared.resume().catch(() => undefined);
}

export function sharedAudioSnapshot() {
  if (!shared) return { state: "none", rate: null, baseLatencyMs: null } as const;
  const base = (shared as { baseLatency?: number }).baseLatency;
  return {
    state: shared.state as string,
    rate: shared.sampleRate,
    baseLatencyMs: typeof base === "number" ? Math.round(base * 10_000) / 10 : null
  };
}

/** Tests: swap the constructor and count how many contexts were made. */
export function setAudioContextFactoryForTest(next: ContextFactory | null) {
  factory = next ?? (() => new AudioContext({ sampleRate: SHARED_SAMPLE_RATE }));
  shared = null;
  created = 0;
}

export function audioContextsCreated() {
  return created;
}
