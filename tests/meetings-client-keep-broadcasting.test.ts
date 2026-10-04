import { describe, expect, it } from "vitest";
import { BehaviorSubject, Observable, switchMap, of, tap } from "rxjs";
import { keepBroadcasting } from "@/src/lib/meetings/client/keep-broadcasting";

/** Mirrors partytracks: isBroadcasting$ only moves while broadcastTrack$ is subscribed. */
function fakeSource() {
  const shouldBroadcast$ = new BehaviorSubject(true);
  const isBroadcasting$ = new BehaviorSubject(false);
  let active = 0;
  const content = { kind: "video" } as MediaStreamTrack;
  const fallback = { kind: "fallback" } as unknown as MediaStreamTrack;
  const broadcastTrack$ = new Observable<MediaStreamTrack>((subscriber) => {
    active += 1;
    const sub = shouldBroadcast$
      .pipe(switchMap((on) => of(on ? content : fallback).pipe(tap(() => isBroadcasting$.next(on)))))
      .subscribe(subscriber);
    return () => {
      active -= 1;
      sub.unsubscribe();
    };
  });
  return { broadcastTrack$, shouldBroadcast$, isBroadcasting$, activeCount: () => active };
}

describe("keepBroadcasting", () => {
  it("makes pre-join toggles reflect state without anything published", () => {
    const camera = fakeSource();
    expect(camera.isBroadcasting$.value).toBe(false);

    const release = keepBroadcasting([camera]);
    expect(camera.isBroadcasting$.value).toBe(true);
    camera.shouldBroadcast$.next(false);
    expect(camera.isBroadcasting$.value).toBe(false);
    camera.shouldBroadcast$.next(true);
    expect(camera.isBroadcasting$.value).toBe(true);

    release();
    expect(camera.activeCount()).toBe(0);
  });

  it("holds every source and releases them all", () => {
    const mic = fakeSource();
    const camera = fakeSource();
    const release = keepBroadcasting([mic, camera]);
    expect(mic.activeCount() + camera.activeCount()).toBe(2);
    release();
    expect(mic.activeCount() + camera.activeCount()).toBe(0);
  });
});
