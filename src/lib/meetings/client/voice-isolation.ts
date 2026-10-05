import { resumeSharedAudio } from "./audio-context";

/**
 * Voice isolation settings and safety checks. The audio graph itself is in voice-graph.ts.
 * RNNoise (ML noise suppression) runs in an AudioWorklet on the device, as a partytracks mic
 * transformation. Audio never leaves the device for this, so E2EE is unaffected.
 * The worklet and wasm are vendored same-origin in public/vendor/noise-suppressor and loaded
 * lazily, only when voice isolation is on.
 */

export const VOICE_ISOLATION_STORAGE_KEY = "infocus.meet.voiceIsolation";
export const VOICE_ISOLATION_DEFAULT = true;

export const NOISE_SUPPRESSOR_ASSETS = {
  worklet: "/vendor/noise-suppressor/rnnoiseWorklet.js",
  wasm: "/vendor/noise-suppressor/rnnoise.wasm",
  simdWasm: "/vendor/noise-suppressor/rnnoise_simd.wasm"
} as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** On unless the person turned it off on this device. Storage failures fall back to the default. */
export function readVoiceIsolation(storage: StorageLike | null = defaultStorage()) {
  try {
    const value = storage?.getItem(VOICE_ISOLATION_STORAGE_KEY);
    return value === null || value === undefined ? VOICE_ISOLATION_DEFAULT : value === "1";
  } catch {
    return VOICE_ISOLATION_DEFAULT;
  }
}

export function writeVoiceIsolation(on: boolean, storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(VOICE_ISOLATION_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the setting just won't stick.
  }
}

/** Call from a click/tap (join, unmute) to start suspended voice-isolation audio (shared context). */
export function resumeVoiceIsolation() {
  resumeSharedAudio();
}

/** RNNoise is a 48 kHz model; the vendored worklet never checks the rate (it just takes 480-sample frames). */
export const RNNOISE_SAMPLE_RATE = 48_000;

/**
 * Whether RNNoise may run. The AudioContext must really be 48 kHz (browsers may ignore the
 * requested rate), and the mic must be 48 kHz too: WebKit mis-resamples a MediaStreamSource whose
 * rate differs from its context (pitch-shifted, robotic audio), and Firefox throws. On Chromium
 * a mic that doesn't report its rate is allowed (it resamples correctly). Anything else: bypass.
 */
export function rnnoiseSupported(input: { ctxRate: number; trackRate: number | undefined; isChromium: boolean }) {
  if (input.ctxRate !== RNNOISE_SAMPLE_RATE) return false;
  if (input.trackRate === RNNOISE_SAMPLE_RATE) return true;
  return input.trackRate === undefined && input.isChromium;
}

export function isChromiumBrowser(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  // iOS Chrome ("CriOS") is WebKit and has no "Chrome/" token.
  return /\bChrome\/\d+/.test(userAgent);
}

/** Which engine voice isolation uses right now, for the settings line and diagnostics. */
export type VoiceIsolationEngine = "rnnoise" | "browser" | "off";
let engineStatus: VoiceIsolationEngine = "off";
const statusListeners = new Set<() => void>();

export function setEngineStatus(next: VoiceIsolationEngine) {
  if (engineStatus === next) return;
  engineStatus = next;
  statusListeners.forEach((listener) => listener());
}

export function getVoiceIsolationEngine() {
  return engineStatus;
}

export function subscribeVoiceIsolationEngine(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}
