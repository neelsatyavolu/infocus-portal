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
    const node = new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary: wasm });
    await processorReady(node.port, PROCESSOR_READY_TIMEOUT_MS).catch((error: unknown) => {
      node.destroy();
      throw error;
    });
    return node;
  },
  isChromium: () => isChromiumBrowser()
};

/** A slow device still gets RNNoise if it compiles in time; otherwise the raw mic stays. */
export const PROCESSOR_READY_TIMEOUT_MS = 5000;

/**
 * Resolves once the worklet's processor has compiled RNNoise (it posts "ready"; the vendored
 * worklet is patched for this, see scripts/vendor-noise-suppressor.mjs). Until then it outputs
 * silence, so switching to it earlier would swallow the first words after unmuting.
 */
export function processorReady(port: MessagePort, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new Error("RNNoise took too long to start")), timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.data === "ready") done(null);
      else if (event.data === "error") done(new Error("RNNoise failed to start"));
    };
    const done = (error: Error | null) => {
      clearTimeout(timer);
      port.removeEventListener("message", onMessage);
      if (error) reject(error);
      else resolve();
    };
    port.addEventListener("message", onMessage);
    port.start();
  });
}
