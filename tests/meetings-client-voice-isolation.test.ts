import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceIsolationTransform, type NoiseEngine } from "@/src/lib/meetings/client/voice-graph";
import {
  VOICE_ISOLATION_STORAGE_KEY,
  getVoiceIsolationEngine,
  isChromiumBrowser,
  readVoiceIsolation,
  rnnoiseSupported,
  writeVoiceIsolation
} from "@/src/lib/meetings/client/voice-isolation";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  };
}

describe("voice isolation setting", () => {
  it("defaults on and round-trips", () => {
    const storage = memoryStorage();
    expect(readVoiceIsolation(storage)).toBe(true);
    writeVoiceIsolation(false, storage);
    expect(storage.getItem(VOICE_ISOLATION_STORAGE_KEY)).toBe("0");
    expect(readVoiceIsolation(storage)).toBe(false);
    writeVoiceIsolation(true, storage);
    expect(readVoiceIsolation(storage)).toBe(true);
  });

  it("ignores an off saved before Oct 6, 2026 (the robotic-audio days): back on by default", () => {
    const storage = memoryStorage({ "infocus.meet.voiceIsolation": "0" });
    expect(readVoiceIsolation(storage)).toBe(true);
  });

  it("survives broken or missing storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      }
    };
    expect(readVoiceIsolation(broken)).toBe(true);
    expect(() => writeVoiceIsolation(false, broken)).not.toThrow();
    expect(readVoiceIsolation(null)).toBe(true);
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type FakeNode = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  channelCount?: number;
  channelCountMode?: string;
  channelInterpretation?: string;
};
const audioNode = (): FakeNode => ({ connect: vi.fn(), disconnect: vi.fn() });

function fakeEngine(options: { failWasm?: boolean; ctxRate?: number; chromium?: boolean; holdNode?: boolean } = {}) {
  const output = { stop: vi.fn(), kind: "audio" };
  const sources: FakeNode[] = [];
  const gains: Array<FakeNode & { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn>; cancelScheduledValues: ReturnType<typeof vi.fn> } }> = [];
  const nodes: Array<FakeNode & { destroy: ReturnType<typeof vi.fn>; onprocessorerror?: () => void }> = [];
  let releaseNode: () => void = () => undefined;
  const nodeGate = options.holdNode ? new Promise<void>((resolve) => (releaseNode = resolve)) : Promise.resolve();
  const context = {
    state: "running",
    sampleRate: options.ctxRate ?? 48_000,
    currentTime: 1,
    resume: vi.fn(() => Promise.resolve()),
    createMediaStreamSource: vi.fn(() => {
      const source = audioNode();
      sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gain = {
        ...audioNode(),
        gain: {
          value: 1,
          setTargetAtTime: vi.fn(function (this: { value: number }, value: number) {
            gain.gain.value = value;
          }),
          cancelScheduledValues: vi.fn()
        }
      };
      gains.push(gain);
      return gain;
    }),
    createMediaStreamDestination: vi.fn(() => ({ ...audioNode(), stream: { getAudioTracks: () => [output] } }))
  };
  const engine: NoiseEngine = {
    loadWasm: vi.fn(() => (options.failWasm ? Promise.reject(new Error("404")) : Promise.resolve(new ArrayBuffer(8)))),
    getContext: vi.fn(() => context as unknown as AudioContext),
    createNode: vi.fn(async () => {
      await nodeGate;
      const node = { ...audioNode(), destroy: vi.fn() };
      nodes.push(node);
      return node as unknown as AudioNode;
    }),
    isChromium: () => options.chromium ?? true
  };
  const [raw, proc] = [() => gains[0], () => gains[1]];
  return { engine, context, output, sources, gains, nodes, raw, proc, releaseNode: () => releaseNode() };
}

const mic = (rate: number | undefined = 48_000) =>
  ({ stop: vi.fn(), applyConstraints: vi.fn(), getSettings: () => ({ sampleRate: rate }) }) as unknown as MediaStreamTrack;

describe("voice isolation graph", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "MediaStream",
      class {
        constructor(readonly tracks: unknown[]) {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("emits the graph output at once: raw until RNNoise is ready, then a crossfade (no track swap)", async () => {
    const fake = fakeEngine({ holdNode: true });
    const input = mic();
    const seen: unknown[] = [];
    createVoiceIsolationTransform(fake.engine, vi.fn())(input).subscribe((t) => seen.push(t));
    expect(seen).toEqual([fake.output]);
    expect(fake.raw().gain.value).toBe(1);
    expect(fake.proc().gain.value).toBe(0);
    fake.releaseNode();
    await flush();
    expect(fake.sources[0].connect).toHaveBeenCalledWith(fake.nodes[0]);
    expect(fake.raw().gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, expect.any(Number));
    expect(fake.proc().gain.setTargetAtTime).toHaveBeenCalledWith(1, 1, expect.any(Number));
    expect(seen).toEqual([fake.output]);
    expect(getVoiceIsolationEngine()).toBe("rnnoise");
  });

  it("down-mixes to mono before RNNoise", async () => {
    const fake = fakeEngine();
    createVoiceIsolationTransform(fake.engine, vi.fn())(mic()).subscribe();
    await flush();
    expect(fake.nodes[0]).toMatchObject({ channelCount: 1, channelCountMode: "explicit", channelInterpretation: "speakers" });
  });

  it("reuses one context, one RNNoise node and one output track across unmutes and device switches", async () => {
    const fake = fakeEngine();
    const transform = createVoiceIsolationTransform(fake.engine, vi.fn());
    const outputs = new Set<unknown>();
    for (let i = 0; i < 5; i += 1) {
      const input = mic();
      // partytracks subscribes twice per mic track (broadcast + local monitor).
      const a = transform(input).subscribe((t) => outputs.add(t));
      const b = transform(input).subscribe((t) => outputs.add(t));
      await flush();
      a.unsubscribe();
      b.unsubscribe();
    }
    expect(fake.engine.createNode).toHaveBeenCalledTimes(1);
    expect(fake.context.createMediaStreamDestination).toHaveBeenCalledTimes(1);
    expect(fake.sources).toHaveLength(5);
    expect(fake.sources.every((source) => source.disconnect.mock.calls.length === 1)).toBe(true);
    expect(outputs.size).toBe(1);
    expect(fake.output.stop).not.toHaveBeenCalled();
  });

  it("a re-acquired mic starts processed straight away (no raw moment)", async () => {
    const fake = fakeEngine();
    const transform = createVoiceIsolationTransform(fake.engine, vi.fn());
    transform(mic()).subscribe().unsubscribe();
    await flush();
    transform(mic()).subscribe();
    expect(fake.raw().gain.value).toBe(0);
    expect(fake.proc().gain.value).toBe(1);
  });

  it("never stops the mic and never changes its processing (no applyConstraints)", async () => {
    const fake = fakeEngine();
    const input = mic();
    createVoiceIsolationTransform(fake.engine, vi.fn())(input).subscribe().unsubscribe();
    await flush();
    expect(input.stop).not.toHaveBeenCalled();
    expect(input.applyConstraints).not.toHaveBeenCalled();
  });

  it("bypasses RNNoise when the rates don't match: the mic itself, no graph, no error", async () => {
    const onUnavailable = vi.fn();
    const onBypass = vi.fn();
    for (const [ctxRate, trackRate, chromium] of [
      [44_100, 48_000, true],
      [48_000, 44_100, true],
      [48_000, 16_000, false],
      [48_000, undefined, false]
    ] as const) {
      const fake = fakeEngine({ ctxRate, chromium });
      const input = { stop: vi.fn(), getSettings: () => ({ sampleRate: trackRate }) } as unknown as MediaStreamTrack;
      const seen: unknown[] = [];
      createVoiceIsolationTransform(fake.engine, onUnavailable, onBypass)(input).subscribe((t) => seen.push(t));
      await flush();
      expect(seen).toEqual([input]);
      expect(fake.engine.loadWasm).not.toHaveBeenCalled();
      expect(fake.context.createMediaStreamSource).not.toHaveBeenCalled();
      expect(getVoiceIsolationEngine()).toBe("browser");
    }
    expect(onBypass).toHaveBeenCalledTimes(4);
    expect(onBypass).toHaveBeenCalledWith({ ctxRate: 44_100, trackRate: 48_000 });
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("wasm failure: keeps the raw path through the graph and reports once", async () => {
    const fake = fakeEngine({ failWasm: true });
    const onUnavailable = vi.fn();
    const seen: unknown[] = [];
    createVoiceIsolationTransform(fake.engine, onUnavailable)(mic()).subscribe((t) => seen.push(t));
    await flush();
    expect(seen).toEqual([fake.output]);
    expect(fake.raw().gain.value).toBe(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("a worklet processor error falls back to raw at once", async () => {
    const fake = fakeEngine();
    createVoiceIsolationTransform(fake.engine, vi.fn())(mic()).subscribe();
    await flush();
    fake.nodes[0].onprocessorerror?.();
    expect(fake.nodes[0].disconnect).toHaveBeenCalled();
    expect(fake.raw().gain.value).toBe(1);
    expect(fake.proc().gain.value).toBe(0);
    expect(getVoiceIsolationEngine()).toBe("browser");
  });
});

describe("rnnoiseSupported", () => {
  it("needs a real 48 kHz context", () => {
    expect(rnnoiseSupported({ ctxRate: 44_100, trackRate: 48_000, isChromium: true })).toBe(false);
    expect(rnnoiseSupported({ ctxRate: 24_000, trackRate: undefined, isChromium: true })).toBe(false);
  });

  it("needs a 48 kHz mic, or an unreported rate on Chromium only", () => {
    expect(rnnoiseSupported({ ctxRate: 48_000, trackRate: 48_000, isChromium: false })).toBe(true);
    expect(rnnoiseSupported({ ctxRate: 48_000, trackRate: undefined, isChromium: true })).toBe(true);
    expect(rnnoiseSupported({ ctxRate: 48_000, trackRate: undefined, isChromium: false })).toBe(false);
    expect(rnnoiseSupported({ ctxRate: 48_000, trackRate: 44_100, isChromium: true })).toBe(false);
    expect(rnnoiseSupported({ ctxRate: 48_000, trackRate: 16_000, isChromium: false })).toBe(false);
  });

  it("detects Chromium from the user agent (iOS Chrome is WebKit)", () => {
    expect(isChromiumBrowser("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toBe(true);
    expect(isChromiumBrowser("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe(false);
    expect(isChromiumBrowser("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});
