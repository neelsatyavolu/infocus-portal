import { NOISE_SUPPRESSOR_ASSETS, type NoiseEngine } from "./voice-isolation";

/** RNNoise assumes 48 kHz. */
const SAMPLE_RATE = 48_000;

let wasmPromise: Promise<ArrayBuffer> | null = null;

/** The real RNNoise engine. The package is imported lazily (it subclasses AudioWorkletNode at load). */
export const rnnoiseEngine: NoiseEngine = {
  loadWasm: () => {
    if (!wasmPromise) {
      wasmPromise = import("@sapphi-red/web-noise-suppressor").then(({ loadRnnoise }) =>
        loadRnnoise({ url: NOISE_SUPPRESSOR_ASSETS.wasm, simdUrl: NOISE_SUPPRESSOR_ASSETS.simdWasm })
      );
      // A failed load can be retried next time voice isolation starts.
      wasmPromise.catch(() => {
        wasmPromise = null;
      });
    }
    return wasmPromise;
  },
  createContext: () => new AudioContext({ sampleRate: SAMPLE_RATE }),
  createNode: async (context, wasm) => {
    const { RnnoiseWorkletNode } = await import("@sapphi-red/web-noise-suppressor");
    await context.audioWorklet.addModule(NOISE_SUPPRESSOR_ASSETS.worklet);
    return new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary: wasm });
  }
};
