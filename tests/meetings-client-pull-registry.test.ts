import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, type Subscription } from "rxjs";
import type { SimulcastRid } from "@/src/lib/meetings/client/quality";
import { PULL_RELEASE_MS, PullRegistry, highestRid, metaKeyOf, type PullFn } from "@/src/lib/meetings/client/pull-registry";

function fakePull() {
  const pulls: Array<{ trackName: string; rids: Array<SimulcastRid | undefined>; unsubscribed: boolean; track: MediaStreamTrack }> = [];
  const pull: PullFn = (meta, rid$) =>
    new Observable<MediaStreamTrack>((subscriber) => {
      const record = { trackName: meta.trackName, rids: [] as Array<SimulcastRid | undefined>, unsubscribed: false, track: { id: `t-${meta.trackName}-${pulls.length}` } as MediaStreamTrack };
      pulls.push(record);
      const ridSub = rid$?.subscribe((rid) => record.rids.push(rid));
      subscriber.next(record.track);
      return () => {
        record.unsubscribed = true;
        ridSub?.unsubscribe();
      };
    });
  return { pulls, pull };
}

describe("PullRegistry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shares one pull between consumers and across a remount (layout switch)", () => {
    const fake = fakePull();
    const registry = new PullRegistry(fake.pull);
    const grid = registry.acquire("s1/video", true, "q");
    const subs: Subscription[] = [grid.track$.subscribe()];
    // Layout switch: the grid tile unmounts, the spotlight tile mounts.
    subs[0].unsubscribe();
    grid.release();
    const main = registry.acquire("s1/video", true, "f");
    subs.push(main.track$.subscribe());
    expect(fake.pulls).toHaveLength(1);
    expect(fake.pulls[0].unsubscribed).toBe(false);
  });

  it("asks for the highest layer any consumer wants", () => {
    const fake = fakePull();
    const registry = new PullRegistry(fake.pull);
    const a = registry.acquire("s1/video", true, "q");
    a.track$.subscribe();
    const b = registry.acquire("s1/video", true, "h");
    b.track$.subscribe();
    expect(fake.pulls[0].rids.at(-1)).toBe("h");
    b.setRid("f");
    expect(fake.pulls[0].rids.at(-1)).toBe("f");
    b.release();
    expect(fake.pulls[0].rids.at(-1)).toBe("q");
  });

  it("releases the pull 15 s after the last consumer leaves, and forgets the track", () => {
    const fake = fakePull();
    const released: MediaStreamTrack[] = [];
    const registry = new PullRegistry(fake.pull, (track) => released.push(track));
    const handle = registry.acquire("s1/audio", false);
    const sub = handle.track$.subscribe();
    sub.unsubscribe();
    handle.release();
    vi.advanceTimersByTime(PULL_RELEASE_MS - 1);
    expect(fake.pulls[0].unsubscribed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(fake.pulls[0].unsubscribed).toBe(true);
    expect(released).toEqual([fake.pulls[0].track]);
    expect(registry.size).toBe(0);
    // A later consumer gets a fresh pull.
    registry.acquire("s1/audio", false).track$.subscribe();
    expect(fake.pulls).toHaveLength(2);
  });

  it("keeps simulcast and plain pulls of the same track apart", () => {
    const fake = fakePull();
    const registry = new PullRegistry(fake.pull);
    registry.acquire("s1/screen", false).track$.subscribe();
    registry.acquire("s1/screen", true, "f").track$.subscribe();
    expect(fake.pulls).toHaveLength(2);
  });

  it("helpers", () => {
    expect(highestRid(["q", "f", "h"])).toBe("f");
    expect(highestRid([])).toBeUndefined();
    expect(metaKeyOf({ sessionId: "s", trackName: "t" })).toBe("s/t");
    expect(metaKeyOf({ sessionId: "s" })).toBeNull();
  });
});
