import { Observable } from "rxjs";
import { diagEvent } from "./diagnostics";
import { rnnoiseSupported, setEngineStatus } from "./voice-isolation";

/**
 * Voice isolation audio graph: ONE long-lived graph per page on the shared AudioContext.
 *
 *   mic source ─┬─► rawGain ─────────────────┐
 *               └─► RNNoise (mono) ─► procGain ┴─► destination ─► output track (sent)
 *
 * - Built once. Unmute (the mic is re-acquired every time), device switches and the hover
 *   pre-warm only swap the MediaStreamSource; the RNNoise node, wasm and output track stay.
 * - The output track is emitted at once: raw audio flows through rawGain until RNNoise is ready,
 *   then a short crossfade moves to procGain. No sender track swap, so no click.
 * - RNNoise only runs at matching 48 kHz rates (see rnnoiseSupported); otherwise the mic track
 *   passes straight through and the browser's own noise suppression does the work.
 * - Input is down-mixed to mono (explicit channelCount 1, "speakers": (L+R)/2) before RNNoise.
 * - The browser's noiseSuppression stays on (no applyConstraints on the live mic).
 */

export type NoiseEngine = {
  /** Fetches the wasm once (plain or SIMD). */
  loadWasm: () => Promise<ArrayBuffer>;
  /** The page's shared AudioContext. */
  getContext: () => AudioContext;
  /** Registers the worklet module on the context (once) and builds the RNNoise node. */
  createNode: (context: AudioContext, wasm: ArrayBuffer) => Promise<AudioWorkletNode | (AudioNode & { destroy?: () => void })>;
  isChromium: () => boolean;
};

export const CROSSFADE_S = 0.04;

type Callbacks = {
  onUnavailable: () => void;
  onBypass: (info: { ctxRate: number; trackRate: number | undefined }) => void;
};

type Active = { input: MediaStreamTrack; source: MediaStreamAudioSourceNode };

/** For diagnostics: the mic track currently feeding the graph (or passed through). */
let currentInput: MediaStreamTrack | null = null;
export function voiceInputTrack() {
  return currentInput;
}

function mono<T extends AudioNode>(node: T): T {
  node.channelCount = 1;
  node.channelCountMode = "explicit";
  node.channelInterpretation = "speakers";
  return node;
}

export function createVoiceGraph(engine: NoiseEngine, callbacks: Callbacks) {
  let built: {
    ctx: AudioContext;
    rawGain: GainNode;
    procGain: GainNode;
    output: MediaStreamTrack;
  } | null = null;
  let node: AudioNode | null = null;
  let loading = false;
  let active: Active | null = null;

  const fade = (toProcessed: boolean, instant = false) => {
    if (!built) return;
    const { ctx, rawGain, procGain } = built;
    const now = ctx.currentTime;
    const set = (gain: GainNode, value: number) => {
      gain.gain.cancelScheduledValues?.(now);
      if (instant || !gain.gain.setTargetAtTime) gain.gain.value = value;
      else gain.gain.setTargetAtTime(value, now, CROSSFADE_S / 3);
    };
    set(rawGain, toProcessed ? 0 : 1);
    set(procGain, toProcessed ? 1 : 0);
    setEngineStatus(toProcessed ? "rnnoise" : "browser");
  };

  const dropNode = () => {
    node?.disconnect();
    (node as { destroy?: () => void } | null)?.destroy?.();
    node = null;
    fade(false);
  };

  const loadNode = () => {
    if (node || loading || !built) return;
    loading = true;
    const { ctx, procGain } = built;
    engine
      .loadWasm()
      .then((wasm) => engine.createNode(ctx, wasm))
      .then((created) => {
        loading = false;
        node = mono(created);
        node.connect(procGain);
        (created as { onprocessorerror?: (() => void) | null }).onprocessorerror = () => {
          diagEvent("rnnoise_processor_error");
          dropNode(); // Raw (with the browser's suppression) keeps flowing.
        };
        if (active) {
          active.source.connect(node);
          fade(true);
        }
      })
      .catch(() => {
        loading = false;
        callbacks.onUnavailable();
      });
  };

  const build = () => {
    if (built) return built;
    const ctx = engine.getContext();
    const destination = ctx.createMediaStreamDestination();
    const rawGain = mono(ctx.createGain());
    const procGain = mono(ctx.createGain());
    rawGain.gain.value = 1;
    procGain.gain.value = 0;
    rawGain.connect(destination);
    procGain.connect(destination);
    const output = destination.stream.getAudioTracks()[0];
    if (!output) throw new Error("No processed audio track");
    built = { ctx, rawGain, procGain, output };
    return built;
  };

  /** Feeds `input` into the graph; returns the output track, or null to pass `input` through. */
  const attach = (input: MediaStreamTrack): MediaStreamTrack | null => {
    const ctx = engine.getContext();
    const trackRate = typeof input.getSettings === "function" ? input.getSettings().sampleRate : undefined;
    currentInput = input;
    if (!rnnoiseSupported({ ctxRate: ctx.sampleRate, trackRate, isChromium: engine.isChromium() })) {
      setEngineStatus("browser");
      callbacks.onBypass({ ctxRate: ctx.sampleRate, trackRate });
      return null;
    }
    const graph = build();
    if (active) active.source.disconnect();
    const source = graph.ctx.createMediaStreamSource(new MediaStream([input]));
    source.connect(graph.rawGain);
    if (node) {
      source.connect(node);
      fade(true, true); // A fresh source (unmute): start processed, nothing to fade from.
    } else {
      fade(false, true);
      loadNode();
    }
    active = { input, source };
    if (graph.ctx.state === "suspended") void graph.ctx.resume().catch(() => undefined);
    return graph.output;
  };

  const detach = (input: MediaStreamTrack) => {
    if (currentInput === input) currentInput = null;
    if (!active || active.input !== input) return;
    active.source.disconnect();
    active = null;
  };

  return { attach, detach };
}

/**
 * A stable `(track) => Observable<track>` for mic.addTransform. Subscribers of one mic track
 * (partytracks' broadcast and local monitor) share one attachment; the graph is shared by all.
 */
export function createVoiceIsolationTransform(
  engine: NoiseEngine,
  onUnavailable: () => void,
  onBypass: Callbacks["onBypass"] = () => undefined
) {
  const graph = createVoiceGraph(engine, { onUnavailable, onBypass });
  const attached = new Map<MediaStreamTrack, { refs: number; output: MediaStreamTrack }>();

  return (input: MediaStreamTrack) =>
    new Observable<MediaStreamTrack>((subscriber) => {
      let entry = attached.get(input);
      if (!entry) {
        let output: MediaStreamTrack = input;
        try {
          output = graph.attach(input) ?? input;
        } catch {
          onUnavailable();
        }
        entry = { refs: 0, output };
        attached.set(input, entry);
      }
      const current = entry;
      current.refs += 1;
      subscriber.next(current.output);
      return () => {
        current.refs -= 1;
        if (current.refs > 0) return;
        attached.delete(input);
        graph.detach(input);
      };
    });
}
