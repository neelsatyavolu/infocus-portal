import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";

class FakeWorker {
  static last: FakeWorker | null = null;
  posted: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {}
}

describe("decrypt-failure tracking", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forgets a track that went away, here and in the worker", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const e2ee = new MeetingE2ee();
    const worker = FakeWorker.last!;
    const changes = vi.fn();
    e2ee.subscribe(changes);
    worker.onmessage?.({ data: { type: "decrypt", id: "track-1", ok: false } });
    expect(e2ee.isFailing("track-1")).toBe(true);
    e2ee.forget("track-1");
    expect(e2ee.isFailing("track-1")).toBe(false);
    expect(e2ee.failingCount()).toBe(0);
    expect(worker.posted).toContainEqual({ type: "forget", id: "track-1" });
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("tracks the newest key epoch", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const e2ee = new MeetingE2ee();
    expect(e2ee.currentEpoch).toBe(-1);
    const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"; // bytes 0..31, a fixture, not a secret gitleaks:allow
    await e2ee.setKey(key, 3);
    await e2ee.setKey(key, 1);
    expect(e2ee.currentEpoch).toBe(3);
  });
});
