import { StreamingTranscriber, type TranscriptUpdate, type Utterance } from "@/src/lib/teleprompter-listen";

/*
 * Run mode's ears, all in the browser: the microphone goes through an AudioWorklet (16 kHz mono
 * blocks), a speech model runs in a module worker (transformers.js from the jsDelivr CDN, the
 * model from Hugging Face; Chrome caches both after the first load), and StreamingTranscriber
 * turns its reads into words. Nothing is sent anywhere: audio stays on this computer.
 */

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";
const SAMPLE_RATE = 16000;
const BLOCK = 1600;
/** Generous for read speech (about 3 words a second); stops a confused model from rambling. */
const TOKENS_PER_SECOND = 7;
/** A read that takes longer than this is treated as failed, so one stuck read can't stop listening. */
const DECODE_TIMEOUT_MS = 8000;
/** This many failed reads in a row means the model is broken (for example a lost GPU). */
const MAX_FAILED_READS = 5;

export type SpeechModelChoice = "fast" | "accurate";
export type MicChannel = "mix" | "left" | "right";

export const SPEECH_MODELS: Record<SpeechModelChoice, { label: string; id: string; size: string }> = {
  fast: { label: "Fast", id: "onnx-community/moonshine-base-ONNX", size: "about 150 MB" },
  accurate: { label: "Accurate", id: "onnx-community/whisper-base.en", size: "about 210 MB" }
};

export type ListenerStatus =
  | { phase: "starting" }
  | { phase: "loading"; progress: number | null }
  | { phase: "listening"; engine: string }
  | { phase: "error"; message: string };

export type ListenerLevel = { db: number; thresholdDb: number; speaking: boolean };

const WORKER_SOURCE = `
import { pipeline, env } from "${TRANSFORMERS_URL}";
env.allowLocalModels = false;
let asr = null;
const files = new Map();

function progress(event) {
  if (event.status !== "progress" || !event.total) return;
  files.set(event.file, [event.loaded, event.total]);
  let loaded = 0;
  let total = 0;
  for (const [fileLoaded, fileTotal] of files.values()) {
    loaded += fileLoaded;
    total += fileTotal;
  }
  self.postMessage({ type: "progress", value: total ? loaded / total : null });
}

async function warm(options) {
  asr = await pipeline("automatic-speech-recognition", options.model, { ...options.load, progress_callback: progress });
  await asr(new Float32Array(16000), { max_new_tokens: 8 });
}

async function load(model) {
  const adapter = self.navigator.gpu ? await self.navigator.gpu.requestAdapter().catch(() => null) : null;
  if (adapter) {
    try {
      await warm({ model, load: { device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } } });
      return "WebGPU";
    } catch {
      asr = null;
    }
  }
  await warm({ model, load: { dtype: "q8" } });
  return "CPU";
}

self.onmessage = async ({ data }) => {
  if (data.type === "load") {
    try {
      self.postMessage({ type: "ready", engine: await load(data.model) });
    } catch (error) {
      self.postMessage({ type: "failed", message: String((error && error.message) || error) });
    }
    return;
  }
  if (data.type === "decode") {
    try {
      const out = await asr(data.audio, { max_new_tokens: data.maxTokens });
      self.postMessage({ type: "text", id: data.id, text: (out && out.text) || "" });
    } catch (error) {
      self.postMessage({ type: "text", id: data.id, text: null, message: String((error && error.message) || error) });
    }
  }
};
`;

/** Cuts the (already mono) mix into 16 kHz blocks, resampling when the context runs faster. */
const WORKLET_SOURCE = `
class PrompterTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / ${SAMPLE_RATE};
    this.position = 0;
    this.block = new Float32Array(${BLOCK});
    this.filled = 0;
  }

  process(inputs) {
    const samples = inputs[0] && inputs[0][0];
    if (!samples) return true;
    const frames = samples.length;
    while (this.position < frames) {
      const index = Math.floor(this.position);
      const next = Math.min(index + 1, frames - 1);
      const fraction = this.position - index;
      this.block[this.filled++] = samples[index] * (1 - fraction) + samples[next] * fraction;
      if (this.filled === this.block.length) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(${BLOCK});
        this.filled = 0;
      }
      this.position += this.step;
    }
    this.position -= frames;
    return true;
  }
}
registerProcessor("prompter-tap", PrompterTap);
`;

type Engine = {
  choice: SpeechModelChoice;
  worker: Worker;
  ready: Promise<string>;
  nextId: number;
  /** Resolves each read with its text, or null when the read failed. */
  pending: Map<number, (text: string | null) => void>;
  onProgress: (value: number | null) => void;
  /** Called if the worker dies after it loaded. */
  onCrash: (message: string) => void;
};

/** Throws the engine away, so the next start loads the model again. */
function discardEngine(loaded: Engine) {
  if (engine === loaded) {
    engine = null;
  }
  loaded.worker.terminate();
  for (const resolvePending of loaded.pending.values()) resolvePending(null);
  loaded.pending.clear();
}

// One model per page, kept loaded when Auto is switched off and on again.
let engine: Engine | null = null;

function loadEngine(choice: SpeechModelChoice, onProgress: (value: number | null) => void): Engine {
  if (engine?.choice === choice) {
    engine.onProgress = onProgress;
    return engine;
  }
  engine?.worker.terminate();

  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(url, { type: "module" });
  const loaded: Engine = { choice, worker, ready: Promise.resolve(""), nextId: 0, pending: new Map(), onProgress, onCrash: () => {} };
  loaded.ready = new Promise<string>((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") loaded.onProgress(data.value);
      if (data.type === "ready") resolve(data.engine);
      if (data.type === "failed") reject(new Error(data.message));
      if (data.type === "text") {
        loaded.pending.get(data.id)?.(data.text);
        loaded.pending.delete(data.id);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      const message = event.message || "The speech model stopped.";
      reject(new Error(message));
      discardEngine(loaded);
      loaded.onCrash(message);
    };
  }).finally(() => URL.revokeObjectURL(url));
  // A failed load isn't kept, so the next try starts fresh.
  loaded.ready.catch(() => discardEngine(loaded));
  worker.postMessage({ type: "load", model: SPEECH_MODELS[choice].id });
  engine = loaded;
  return loaded;
}

function decodeWith(loaded: Engine, audio: Float32Array) {
  return new Promise<string | null>((resolve) => {
    const id = loaded.nextId;
    loaded.nextId += 1;
    const timer = window.setTimeout(() => {
      loaded.pending.delete(id);
      resolve(null);
    }, DECODE_TIMEOUT_MS);
    loaded.pending.set(id, (text) => {
      window.clearTimeout(timer);
      resolve(text);
    });
    const maxTokens = Math.ceil((audio.length / SAMPLE_RATE) * TOKENS_PER_SECOND) + 10;
    loaded.worker.postMessage({ type: "decode", id, audio, maxTokens }, [audio.buffer]);
  });
}

function micErrorMessage(error: unknown, which: string) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone blocked. Allow it for this site in Chrome (the icon at the left of the address bar), then turn Auto on again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return `The ${which} isn't connected. Pick another one in Settings.`;
  }
  return error instanceof Error ? error.message : `The ${which} didn't start.`;
}

function openMicrophone(deviceId: string, which: string) {
  return navigator.mediaDevices
    .getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 }
      }
    })
    .catch((error: unknown) => {
      throw new Error(micErrorMessage(error, which));
    });
}

/** Microphones Chrome can see. Names only appear once the page has microphone permission. */
export async function listMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput" && device.deviceId !== "default" && device.deviceId !== "communications")
    .map((device, index) => ({ id: device.deviceId, label: device.label || `Microphone ${index + 1}` }));
}

type AudioInput = { stream: MediaStream; channel: MicChannel };

/**
 * Mixes every microphone down to one mono signal: each mic gives its chosen input (or both,
 * averaged), and two mics add together. Anchors take turns, so one recognizer hears them all.
 */
function mixToMono(context: AudioContext, inputs: AudioInput[]) {
  const mono = context.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = "explicit";
  mono.channelInterpretation = "speakers";
  for (const { stream, channel } of inputs) {
    const source = context.createMediaStreamSource(stream);
    const channels = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
    if (channel === "mix" || channels < 2) {
      source.connect(mono);
    } else {
      const splitter = context.createChannelSplitter(2);
      source.connect(splitter);
      splitter.connect(mono, channel === "left" ? 0 : 1);
    }
  }
  return mono;
}

async function openAudio(inputs: AudioInput[]) {
  let context = new AudioContext({ sampleRate: SAMPLE_RATE });
  let mono: GainNode;
  try {
    mono = mixToMono(context, inputs);
  } catch {
    // This browser can't resample the mic itself; the worklet does it instead.
    void context.close();
    context = new AudioContext();
    mono = mixToMono(context, inputs);
  }
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
  try {
    await context.audioWorklet.addModule(url);
  } catch (error) {
    void context.close();
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
  const tap = new AudioWorkletNode(context, "prompter-tap", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: "explicit"
  });
  // Silent output: some browsers only run a node that leads to the speakers.
  const mute = context.createGain();
  mute.gain.value = 0;
  mono.connect(tap).connect(mute).connect(context.destination);
  return { context, tap };
}

export type ListenerOptions = {
  model: SpeechModelChoice;
  deviceId: string;
  channel: MicChannel;
  /** A second microphone mixed in (for example one per anchor); "" for none. */
  secondDeviceId: string;
  onStatus: (status: ListenerStatus) => void;
  onWords: (update: TranscriptUpdate) => void;
  /** Each finished utterance, for voice commands. */
  onUtterance: (utterance: Utterance) => void;
  onLevel: (level: ListenerLevel) => void;
};

/** Starts listening. Returns stop(); safe to call before startup finishes. */
export function startListener(options: ListenerOptions) {
  let stopped = false;
  let cleanup = () => {};

  async function start() {
    options.onStatus({ phase: "starting" });
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't use a microphone here. Use Chrome on the https site.");
    }

    const inputs: AudioInput[] = [];
    const stopStream = () => inputs.forEach(({ stream }) => stream.getTracks().forEach((track) => track.stop()));
    cleanup = stopStream;
    inputs.push({ stream: await openMicrophone(options.deviceId, "microphone"), channel: options.channel });
    if (options.secondDeviceId && options.secondDeviceId !== options.deviceId) {
      inputs.push({ stream: await openMicrophone(options.secondDeviceId, "second microphone"), channel: "mix" });
    }
    if (stopped) return stopStream();
    const fail = (message: string) => {
      if (stopped) return;
      stopped = true;
      cleanup();
      options.onStatus({ phase: "error", message });
    };
    for (const track of inputs.flatMap(({ stream }) => stream.getAudioTracks())) {
      track.onended = () => fail("A microphone was disconnected. Plug it back in, then turn Auto on again.");
    }

    const loaded = loadEngine(options.model, (progress) => {
      if (!stopped) options.onStatus({ phase: "loading", progress });
    });
    loaded.onCrash = (message) => fail(`The speech model stopped (${message}). Turn Auto on again to restart it.`);
    options.onStatus({ phase: "loading", progress: null });
    let engineName: string;
    try {
      engineName = await loaded.ready;
    } catch (error) {
      throw new Error(`The speech model didn't load: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (stopped) return stopStream();

    let failedReads = 0;
    const transcriber = new StreamingTranscriber({
      blockSize: BLOCK,
      sampleRate: SAMPLE_RATE,
      decode: async (audio) => {
        const text = await decodeWith(loaded, audio);
        failedReads = text === null ? failedReads + 1 : 0;
        if (failedReads >= MAX_FAILED_READS) {
          discardEngine(loaded);
          fail("The speech model keeps failing. Turn Auto on again to reload it, or try the other model.");
        }
        return text ?? "";
      },
      onWords: (update) => {
        if (!stopped) options.onWords(update);
      },
      onUtterance: (utterance) => {
        if (!stopped) options.onUtterance(utterance);
      }
    });
    const { context, tap } = await openAudio(inputs);
    tap.port.onmessage = ({ data }: MessageEvent<Float32Array>) => options.onLevel(transcriber.push(data));
    cleanup = () => {
      transcriber.stop();
      tap.port.onmessage = null;
      void context.close();
      stopStream();
    };
    if (stopped) return cleanup();
    options.onStatus({ phase: "listening", engine: engineName });
  }

  start().catch((error: unknown) => {
    cleanup();
    if (!stopped) {
      options.onStatus({ phase: "error", message: error instanceof Error ? error.message : String(error) });
    }
  });

  return () => {
    if (!stopped) {
      stopped = true;
      cleanup();
    }
  };
}
