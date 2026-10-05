import { sharedAudioContext } from "./audio-context";
import type { NoiseEngine } from "./voice-graph";
import { NOISE_SUPPRESSOR_ASSETS, isChromiumBrowser } from "./voice-isolation";

let wasmPromise: Promise<ArrayBuffer> | null = null;
/** The worklet module is registered once per AudioContext. */
const registered = new WeakMap<AudioContext, Promise<void>>();

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
  getContext: sharedAudioContext,
  createNode: async (context, wasm) => {
    const { RnnoiseWorkletNode } = await import("@sapphi-red/web-noise-suppressor");
    let ready = registered.get(context);
    if (!ready) {
      ready = context.audioWorklet.addModule(NOISE_SUPPRESSOR_ASSETS.worklet);
      registered.set(context, ready);
      ready.catch(() => registered.delete(context));
    }
    await ready;
    return new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary: wasm });
  },
  isChromium: () => isChromiumBrowser()
};
