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
  // Suspended/interrupted (iOS phone call, Siri, another app taking audio, a long sleep) silences
  // everything that runs through it, including the voice-isolated mic we send. Log it and try to
  // resume at once; if the browser wants a gesture, the next tap/key/visibility change does it.
  context.addEventListener?.("statechange", () => {
    diagEvent("audio_context", { state: context.state, rate: context.sampleRate });
    if (context === shared && needsResume(context)) resumeSharedAudio();
  });
  installResumeTriggers();
  return context;
}

function needsResume(context: AudioContext) {
  // "interrupted" is WebKit's state while another app has the audio session.
  return (context.state as string) === "suspended" || (context.state as string) === "interrupted";
}

let resuming = false;

/** Resumes a suspended or interrupted context (safe to call any time; joins, unmutes, gestures). */
export function resumeSharedAudio() {
  if (!shared || !needsResume(shared) || resuming) return;
  const context = shared;
  const from = context.state as string;
  resuming = true;
  void context
    .resume()
    .then(() => diagEvent("audio_resume", { from, state: context.state }))
    .catch(() => undefined)
    .finally(() => {
      resuming = false;
    });
}

let triggersInstalled = false;

/** Mid-call resumes need no button: the next pointer/key, the tab coming back, or a bfcache return. */
function installResumeTriggers() {
  if (triggersInstalled || typeof window === "undefined") return;
  triggersInstalled = true;
  const resume = () => resumeSharedAudio();
  window.addEventListener("pointerdown", resume, true);
  window.addEventListener("keydown", resume, true);
  window.addEventListener("pageshow", resume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
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
