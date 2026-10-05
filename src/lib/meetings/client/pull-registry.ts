import { BehaviorSubject, EMPTY, ReplaySubject, catchError, distinctUntilChanged, finalize, share, tap, timer, type Observable } from "rxjs";
import type { MeetingTrackMetadata } from "@/src/lib/meetings/protocol";
import type { SimulcastRid } from "./quality";

/**
 * One live pull per remote track, shared by every component that shows it. Layout switches,
 * remounts (grid ↔ spotlight ↔ strip) and a camera going off and on reuse the same pull instead
 * of renegotiating. A pull is released 15 s after its last consumer goes away. With several
 * consumers, the simulcast layer is the highest any of them asks for.
 */

export const PULL_RELEASE_MS = 15_000;
const RID_ORDER: Record<SimulcastRid, number> = { q: 0, h: 1, f: 2 };

export type PullFn = (
  meta: { location: "remote"; sessionId: string; trackName: string },
  rid$: Observable<SimulcastRid | undefined> | null
) => Observable<MediaStreamTrack>;

type Entry = {
  /** Set right after creation (it refers back to the entry in finalize). */
  track$: Observable<MediaStreamTrack>;
  rid$: BehaviorSubject<SimulcastRid | undefined> | null;
  wants: Map<number, SimulcastRid>;
};

export type PullHandle = {
  track$: Observable<MediaStreamTrack>;
  /** This consumer's wanted layer (simulcast pulls only). */
  setRid: (rid: SimulcastRid) => void;
  release: () => void;
};

export function metaKeyOf(meta: MeetingTrackMetadata | undefined) {
  return meta?.sessionId && meta.trackName ? `${meta.sessionId}/${meta.trackName}` : null;
}

export function highestRid(rids: Iterable<SimulcastRid>): SimulcastRid | undefined {
  let best: SimulcastRid | undefined;
  for (const rid of rids) if (!best || RID_ORDER[rid] > RID_ORDER[best]) best = rid;
  return best;
}

export class PullRegistry {
  private readonly entries = new Map<string, Entry>();
  private nextId = 0;

  constructor(
    private readonly pull: PullFn,
    /** Called when a shared pull is finally released (e.g. to forget its decrypt state). */
    private readonly onReleased: (track: MediaStreamTrack) => void = () => undefined,
    private readonly releaseMs = PULL_RELEASE_MS
  ) {}

  /** A consumer of `metaKey` (sessionId/trackName). `simulcast` pulls carry a preferred layer. */
  acquire(metaKey: string, simulcast: boolean, rid?: SimulcastRid): PullHandle {
    const key = `${metaKey}|${simulcast ? "s" : "-"}`;
    let entry = this.entries.get(key);
    if (!entry) entry = this.create(key, metaKey, simulcast);
    const current = entry;
    const id = this.nextId++;
    if (current.rid$ && rid) {
      current.wants.set(id, rid);
      this.update(current);
    }
    let released = false;
    return {
      track$: current.track$,
      setRid: (next) => {
        if (released || !current.rid$) return;
        current.wants.set(id, next);
        this.update(current);
      },
      release: () => {
        if (released) return;
        released = true;
        current.wants.delete(id);
        this.update(current);
      }
    };
  }

  /** Live entries (tests and diagnostics). */
  get size() {
    return this.entries.size;
  }

  private update(entry: Entry) {
    if (!entry.rid$) return;
    const best = highestRid(entry.wants.values());
    // No consumer left: keep the last layer while the pull waits out its release grace.
    if (best && best !== entry.rid$.value) entry.rid$.next(best);
  }

  private create(key: string, metaKey: string, simulcast: boolean) {
    const [sessionId, ...rest] = metaKey.split("/");
    const rid$ = simulcast ? new BehaviorSubject<SimulcastRid | undefined>(undefined) : null;
    let last: MediaStreamTrack | null = null;
    const entry: Entry = { track$: EMPTY, rid$, wants: new Map() };
    entry.track$ = this.pull(
      { location: "remote", sessionId, trackName: rest.join("/") },
      rid$ ? rid$.pipe(distinctUntilChanged()) : null
    ).pipe(
      tap((track) => {
        last = track;
      }),
      catchError(() => EMPTY),
      finalize(() => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        if (last) this.onReleased(last);
        last = null;
      }),
      share({ connector: () => new ReplaySubject<MediaStreamTrack>(1), resetOnRefCountZero: () => timer(this.releaseMs) })
    );
    this.entries.set(key, entry);
    return entry;
  }
}
