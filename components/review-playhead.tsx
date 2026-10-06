"use client";

import { useSyncExternalStore } from "react";
import { MediaRange } from "@/components/media-range";
import { DEFAULT_REVIEW_FPS, formatFrameAccurateTimecode, formatTimecode } from "@/src/lib/timecode";
import type { BufferedSpan } from "@/src/lib/video-buffer";

/**
 * Tiny observable value. The review player writes the playhead and buffered ranges here on every
 * `timeupdate`/`progress`, and only the small components below re-render, not all of ReviewShell.
 */
export type ValueStore<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) {
        return;
      }
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function useStoreValue<T>(store: ValueStore<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function PlayheadSeekRange({
  playhead,
  buffered,
  max,
  onSeek
}: {
  playhead: ValueStore<number>;
  buffered: ValueStore<BufferedSpan[]>;
  max: number;
  onSeek: (timeSeconds: number) => void;
}) {
  const value = useStoreValue(playhead);
  const spans = useStoreValue(buffered);
  return <MediaRange value={value} max={max} step={0.01} label="Seek" onChange={onSeek} buffered={spans} />;
}

export function PlayheadTimecode({ playhead, frameAccurate = false }: { playhead: ValueStore<number>; frameAccurate?: boolean }) {
  const value = useStoreValue(playhead);
  return <>{frameAccurate ? formatFrameAccurateTimecode(value, undefined, DEFAULT_REVIEW_FPS) : formatTimecode(value)}</>;
}
