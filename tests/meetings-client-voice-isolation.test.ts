import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VOICE_ISOLATION_STORAGE_KEY,
  createVoiceIsolationTransform,
  readVoiceIsolation,
  resumeVoiceIsolation,
  writeVoiceIsolation,
  type NoiseEngine
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

type Fake = { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
const node = (): Fake => ({ connect: vi.fn(), disconnect: vi.fn() });

function fakeEngine(options: { failWasm?: boolean; state?: AudioContextState } = {}) {
  const output = { stop: vi.fn(), kind: "audio" };
  const source = node();
  const destination = { ...node(), stream: { getAudioTracks: () => [output] } };
  const rnnoise = { ...node(), destroy: vi.fn() };
  const context = {
    state: options.state ?? "running",
    close: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    createMediaStreamSource: vi.fn(() => source),
    createMediaStreamDestination: vi.fn(() => destination)
  };
  const engine: NoiseEngine = {
    loadWasm: vi.fn(() => (options.failWasm ? Promise.reject(new Error("404")) : Promise.resolve(new ArrayBuffer(8)))),
    createContext: vi.fn(() => context as unknown as AudioContext),
    createNode: vi.fn(() => Promise.resolve(rnnoise as unknown as AudioNode & { destroy: () => void }))
  };
  return { engine, context, source, destination, rnnoise, output };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createVoiceIsolationTransform", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaStream", class {
      constructor(readonly tracks: unknown[]) {}
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("emits the processed track and tears the graph down without stopping the input", async () => {
    const fake = fakeEngine();
    const transform = createVoiceIsolationTransform(fake.engine, vi.fn());
    const input = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const seen: unknown[] = [];
    const sub = transform(input).subscribe((track) => seen.push(track));
    await flush();

    // Raw mic first (no silence while loading), then the processed track.
    expect(seen).toEqual([input, fake.output]);
    expect(fake.source.connect).toHaveBeenCalledWith(fake.rnnoise);
    expect(fake.rnnoise.connect).toHaveBeenCalledWith(fake.destination);

    sub.unsubscribe();
    expect(fake.source.disconnect).toHaveBeenCalled();
    expect(fake.rnnoise.disconnect).toHaveBeenCalled();
    expect(fake.rnnoise.destroy).toHaveBeenCalled();
    expect(fake.output.stop).toHaveBeenCalled();
    expect(fake.context.close).toHaveBeenCalled();
    expect((input as unknown as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled();
  });

  it("shares one graph per input track and tears down after the last subscriber", async () => {
    const fake = fakeEngine();
    const transform = createVoiceIsolationTransform(fake.engine, vi.fn());
    const input = {} as MediaStreamTrack;
    const a = transform(input).subscribe();
    const b = transform(input).subscribe();
    await flush();
    expect(fake.engine.createContext).toHaveBeenCalledTimes(1);
    a.unsubscribe();
    expect(fake.context.close).not.toHaveBeenCalled();
    b.unsubscribe();
    expect(fake.context.close).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original track and reports once per failure", async () => {
    const fake = fakeEngine({ failWasm: true });
    const onUnavailable = vi.fn();
    const transform = createVoiceIsolationTransform(fake.engine, onUnavailable);
    const input = {} as MediaStreamTrack;
    const seen: unknown[] = [];
    transform(input).subscribe((track) => seen.push(track));
    await flush();
    expect(seen).toEqual([input]);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(fake.engine.createContext).not.toHaveBeenCalled();
  });

  it("does nothing if unsubscribed before loading finishes", async () => {
    const fake = fakeEngine();
    const transform = createVoiceIsolationTransform(fake.engine, vi.fn());
    const seen: unknown[] = [];
    const input = {} as MediaStreamTrack;
    transform(input).subscribe((track) => seen.push(track)).unsubscribe();
    await flush();
    expect(seen).toEqual([input]);
    expect(fake.engine.createContext).not.toHaveBeenCalled();
  });

  it("resumes a suspended context on a user gesture", async () => {
    const fake = fakeEngine({ state: "suspended" });
    const transform = createVoiceIsolationTransform(fake.engine, vi.fn());
    const sub = transform({} as MediaStreamTrack).subscribe();
    await flush();
    fake.context.resume.mockClear();
    resumeVoiceIsolation();
    expect(fake.context.resume).toHaveBeenCalled();
    sub.unsubscribe();
  });

  it("turns the browser's noise suppression off while RNNoise runs and back on after", async () => {
    const fake = fakeEngine();
    const constraints: MediaTrackConstraints[] = [];
    let ns = true;
    const input = {
      readyState: "live",
      getConstraints: () => ({ deviceId: { exact: "mic-1" } }),
      getSettings: () => ({ noiseSuppression: ns }),
      applyConstraints: vi.fn(async (c: MediaTrackConstraints) => {
        constraints.push(c);
        ns = Boolean(c.noiseSuppression);
      }),
      stop: vi.fn()
    } as unknown as MediaStreamTrack;
    const sub = createVoiceIsolationTransform(fake.engine, vi.fn())(input).subscribe();
    await flush();
    expect(constraints[0]).toEqual({ deviceId: { exact: "mic-1" }, noiseSuppression: false, echoCancellation: true, autoGainControl: true });
    sub.unsubscribe();
    await flush();
    expect(constraints[1]).toMatchObject({ deviceId: { exact: "mic-1" }, noiseSuppression: true, echoCancellation: true });
  });

  it("leaves the browser's suppression alone where audio constraints can't change", async () => {
    const fake = fakeEngine();
    const input = {
      readyState: "live",
      getConstraints: () => ({}),
      getSettings: () => ({ noiseSuppression: true }),
      applyConstraints: vi.fn(async () => undefined),
      stop: vi.fn()
    } as unknown as MediaStreamTrack;
    createVoiceIsolationTransform(fake.engine, vi.fn())(input).subscribe().unsubscribe();
    await flush();
    // It was never actually turned off, so nothing to restore.
    expect((input.applyConstraints as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("a device switch builds exactly one new graph and closes the old one", async () => {
    const contexts: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    const fake = fakeEngine();
    const engine = {
      ...fake.engine,
      createContext: vi.fn(() => {
        const ctx = { ...fake.context, close: vi.fn(() => Promise.resolve()) };
        contexts.push(ctx);
        return ctx as unknown as AudioContext;
      })
    };
    const transform = createVoiceIsolationTransform(engine, vi.fn());
    const micA = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const micB = { stop: vi.fn() } as unknown as MediaStreamTrack;
    // partytracks subscribes twice per track (broadcast + local monitor), then switches device.
    const a1 = transform(micA).subscribe();
    const a2 = transform(micA).subscribe();
    await flush();
    a1.unsubscribe();
    a2.unsubscribe();
    const b1 = transform(micB).subscribe();
    const b2 = transform(micB).subscribe();
    await flush();
    expect(contexts).toHaveLength(2);
    expect(contexts[0].close).toHaveBeenCalledTimes(1);
    expect(contexts[1].close).not.toHaveBeenCalled();
    b1.unsubscribe();
    b2.unsubscribe();
    expect(contexts[1].close).toHaveBeenCalledTimes(1);
  });
});
