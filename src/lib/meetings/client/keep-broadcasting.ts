import type { Observable, Unsubscribable } from "rxjs";

type BroadcastSource = { broadcastTrack$: Observable<MediaStreamTrack> };

/**
 * partytracks only acquires a device and updates `isBroadcasting$` while something is
 * subscribed to `broadcastTrack$`. Before joining nothing is published, so the pre-join
 * toggles would never turn on. Holding these subscriptions keeps the sources live; once
 * in the call, push() shares the same subscription (shareReplay).
 */
export function keepBroadcasting(sources: ReadonlyArray<BroadcastSource>): () => void {
  const subscriptions: Unsubscribable[] = sources.map((source) => source.broadcastTrack$.subscribe({ error: () => undefined }));
  return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
}
