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
    const wasm = await engine.loadWasm();
    if (closed) throw new Error("closed");
    context = engine.createContext();
    liveContexts.add(context);
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
  // Failures are handled by subscribers; don't leave an unhandled rejection behind.
  output.catch(() => undefined);
  return { refs: 0, output, teardown };
}

/**
 * Returns a stable transform `(track) => Observable<processed track>` for mic.addTransform.
 * Subscribers of the same input track share one audio graph (partytracks runs transforms
 * separately for the broadcast and the local monitor). If anything fails, the original track is
 * emitted and `onUnavailable` is called.
 */
export function createVoiceIsolationTransform(engine: NoiseEngine, onUnavailable: () => void) {
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

      current.output.then(
        (track) => {
          if (active) subscriber.next(track);
        },
        () => {
          if (!active) return;
          onUnavailable();
          subscriber.next(input);
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
