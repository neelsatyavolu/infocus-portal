import { Observable } from "rxjs";

/**
 * Voice isolation: RNNoise (ML noise suppression) runs in an AudioWorklet on the device, as a
 * partytracks mic transformation. Audio never leaves the device for this, so E2EE is unaffected.
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

/** The audio graph pieces the transform needs; injectable so the lifecycle can be unit tested. */
export type NoiseEngine = {
  /** Fetches the wasm once (plain or SIMD). */
  loadWasm: () => Promise<ArrayBuffer>;
  createContext: () => AudioContext;
  /** Registers the worklet module on a context and builds the RNNoise node. */
  createNode: (context: AudioContext, wasm: ArrayBuffer) => Promise<AudioNode & { destroy?: () => void }>;
  isChromium: () => boolean;
};

type Pipeline = {
  refs: number;
  output: Promise<MediaStreamTrack>;
  teardown: () => void;
};

/** Contexts that may be waiting for a user gesture (Safari/iOS start them suspended). */
const liveContexts = new Set<AudioContext>();

/** Call from a click/tap (join, unmute) to start suspended voice-isolation audio. */
export function resumeVoiceIsolation() {
  liveContexts.forEach((context) => {
    if (context.state === "suspended") void context.resume().catch(() => undefined);
  });
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

function setEngineStatus(next: VoiceIsolationEngine) {
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

/** Thrown when RNNoise must not run here: the raw mic keeps flowing with the browser's own suppression. */
export class RnnoiseBypassed extends Error {
  constructor(readonly ctxRate: number, readonly trackRate: number | undefined) {
    super("RNNoise bypassed: sample rate mismatch");
    this.name = "RnnoiseBypassed";
  }
}

/**
 * The browser's own noiseSuppression is never touched (no mid-call applyConstraints, which can
 * restart capture or reset echo cancellation); it stays on under RNNoise.
 */
function buildPipeline(engine: NoiseEngine, input: MediaStreamTrack): Pipeline {
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: (AudioNode & { destroy?: () => void }) | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let outputTrack: MediaStreamTrack | null = null;
  let closed = false;

  const teardown = () => {
    closed = true;
    source?.disconnect();
    node?.disconnect();
    node?.destroy?.();
    destination?.disconnect();
    outputTrack?.stop(); // Never the input: partytracks owns the mic track.
    if (context) {
      liveContexts.delete(context);
      if (context.state !== "closed") void context.close().catch(() => undefined);
    }
  };

  const output = (async () => {
    // Check the rates before loading anything.
    context = engine.createContext();
    liveContexts.add(context);
    const trackRate = typeof input.getSettings === "function" ? input.getSettings().sampleRate : undefined;
    if (!rnnoiseSupported({ ctxRate: context.sampleRate, trackRate, isChromium: engine.isChromium() })) {
      throw new RnnoiseBypassed(context.sampleRate, trackRate);
    }
    const wasm = await engine.loadWasm();
    if (closed) throw new Error("closed");
    node = await engine.createNode(context, wasm);
    if (closed) throw new Error("closed");
    source = context.createMediaStreamSource(new MediaStream([input]));
    destination = context.createMediaStreamDestination();
    source.connect(node);
    node.connect(destination);
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const track = destination.stream.getAudioTracks()[0];
    if (!track) throw new Error("No processed audio track");
    outputTrack = track;
    return track;
  })();
  // A bypass or failure releases the context right away; subscribers handle the outcome.
  output.catch(() => {
    if (!closed) teardown();
  });
  return { refs: 0, output, teardown };
}

/**
 * Returns a stable transform `(track) => Observable<processed track>` for mic.addTransform.
 * Subscribers of the same input track share one audio graph (partytracks runs transforms
 * separately for the broadcast and the local monitor). The original track is emitted first, then
 * the processed one; if processing fails, the original keeps flowing and `onUnavailable` is called.
 */
export function createVoiceIsolationTransform(
  engine: NoiseEngine,
  onUnavailable: () => void,
  onBypass: (info: { ctxRate: number; trackRate: number | undefined }) => void = () => undefined
) {
  const pipelines = new Map<MediaStreamTrack, Pipeline>();

  return (input: MediaStreamTrack) =>
    new Observable<MediaStreamTrack>((subscriber) => {
      let pipeline = pipelines.get(input);
      if (!pipeline) {
        pipeline = buildPipeline(engine, input);
        pipelines.set(input, pipeline);
      }
      const current = pipeline;
      current.refs += 1;
      let active = true;

      // The raw mic goes out at once (no silence while RNNoise loads); the processed track then
      // replaces it on the sender (replaceTrack, no renegotiation).
      subscriber.next(input);
      current.output.then(
        (track) => {
          setEngineStatus("rnnoise");
          if (active) subscriber.next(track);
        },
        (error: unknown) => {
          if (error instanceof RnnoiseBypassed) {
            // Not an error: this device runs the browser's suppression on the raw mic instead.
            setEngineStatus("browser");
            if (active) onBypass({ ctxRate: error.ctxRate, trackRate: error.trackRate });
            return;
          }
          if (active) onUnavailable();
        }
      );

      return () => {
        active = false;
        current.refs -= 1;
        if (current.refs > 0) return;
        pipelines.delete(input);
        current.teardown();
      };
    });
}
