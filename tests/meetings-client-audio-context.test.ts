import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioContextsCreated,
  resumeSharedAudio,
  setAudioContextFactoryForTest,
  sharedAudioContext,
  sharedAudioSnapshot
} from "@/src/lib/meetings/client/audio-context";

type FakeCtx = {
  state: string;
  sampleRate: number;
  baseLatency: number;
  resume: ReturnType<typeof vi.fn>;
  listeners: Array<() => void>;
  addEventListener: (type: string, cb: () => void) => void;
};

function fakeCtx(state = "running"): FakeCtx {
  const ctx: FakeCtx = {
    state,
    sampleRate: 48_000,
    baseLatency: 0.0053,
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    listeners: [],
    addEventListener: (_type, cb) => ctx.listeners.push(cb)
  };
  return ctx;
}

describe("shared AudioContext", () => {
  let made: FakeCtx[];
  beforeEach(() => {
    made = [];
    setAudioContextFactoryForTest(() => {
      const ctx = fakeCtx("suspended");
      made.push(ctx);
      return ctx as unknown as AudioContext;
    });
  });
  afterEach(() => setAudioContextFactoryForTest(null));

  it("creates exactly one context for meters, chimes and voice isolation", () => {
    const a = sharedAudioContext();
    const b = sharedAudioContext();
    const c = sharedAudioContext();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(audioContextsCreated()).toBe(1);
  });

  it("makes a new one only after the old one closed", () => {
    sharedAudioContext();
    made[0].state = "closed";
    sharedAudioContext();
    expect(audioContextsCreated()).toBe(2);
  });

  it("resumes on a gesture and reports state, rate and latency", () => {
    sharedAudioContext();
    expect(sharedAudioSnapshot()).toEqual({ state: "suspended", rate: 48_000, baseLatencyMs: 5.3 });
    resumeSharedAudio();
    expect(made[0].resume).toHaveBeenCalledTimes(1);
  });
});

describe("shared AudioContext auto-resume", () => {
  let ctx: FakeCtx;
  beforeEach(() => {
    setAudioContextFactoryForTest(() => {
      ctx = fakeCtx("running");
      return ctx as unknown as AudioContext;
    });
  });
  afterEach(() => setAudioContextFactoryForTest(null));

  it("resumes on its own when the context gets suspended or interrupted mid-call", async () => {
    sharedAudioContext();
    for (const state of ["suspended", "interrupted"]) {
      ctx.state = state;
      ctx.listeners.forEach((listener) => listener());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ctx.state).toBe("running");
    }
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it("does nothing while running", () => {
    sharedAudioContext();
    resumeSharedAudio();
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});
