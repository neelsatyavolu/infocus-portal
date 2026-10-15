"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveStateValue } from "@/components/kit/status-tag";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { MEMBER_NOTE_MAX } from "@/src/lib/member-notes";
import {
  type MembersPayload,
  type NoteMap,
  notesFromMembers,
  parseNoteKey,
  rebaseNotes,
  withSavedNotes
} from "./member-notes-model";

const MEMBERS_CACHE_KEY = "members";
const SAVE_DELAY_MS = 700;
/** How long "Saved" stays on an editor before it goes quiet. */
const SAVED_SHOWN_MS = 3000;

type SaveOptions = { keepalive?: boolean };

function toggled(set: ReadonlySet<string>, key: string, on: boolean): ReadonlySet<string> {
  if (set.has(key) === on) return set;
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

function without(record: Readonly<Record<string, string>>, key: string) {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * Members data: the roster and cycles (first copy from the server; without it, GET /api/members
 * shown from the client cache at once and refreshed quietly), note drafts, and autosave (PATCH /api/members/notes) — 700 ms after typing
 * stops, on blur, and on leaving the page. One save per note is in flight at a time; edits made
 * meanwhile go out when it returns, so the server always ends with the latest text. A note that
 * failed to save is sent again by "Try again" and whenever pending notes are flushed.
 */
export function useMemberNotes(initialData: MembersPayload | null) {
  const [initial] = useState(() => initialData ?? cachedValue<MembersPayload>(MEMBERS_CACHE_KEY) ?? null);
  const [data, setData] = useState<MembersPayload | null>(initial);
  const [drafts, setDrafts] = useState<NoteMap>(() => (initial ? notesFromMembers(initial.members) : {}));
  const [saved, setSaved] = useState<NoteMap>(() => (initial ? notesFromMembers(initial.members) : {}));
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [errorKeys, setErrorKeys] = useState<Readonly<Record<string, string>>>({});

  const dataRef = useRef(data);
  const draftsRef = useRef(drafts);
  const savedRef = useRef(saved);
  const touchedRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlightRef = useRef(new Set<string>());
  const resaveRef = useRef(new Set<string>());
  const errorKeysRef = useRef<Readonly<Record<string, string>>>({});
  const savedTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const writeDrafts = useCallback((next: NoteMap) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const writeErrors = useCallback((update: (previous: Readonly<Record<string, string>>) => Readonly<Record<string, string>>) => {
    errorKeysRef.current = update(errorKeysRef.current);
    setErrorKeys(errorKeysRef.current);
  }, []);

  /** "Saved" shows on this note for a few seconds, then the editor goes quiet again. */
  const flashSaved = useCallback((key: string) => {
    setSavedKeys((prev) => toggled(prev, key, true));
    const existing = savedTimersRef.current.get(key);
    if (existing) clearTimeout(existing);
    savedTimersRef.current.set(
      key,
      setTimeout(() => {
        savedTimersRef.current.delete(key);
        if (mountedRef.current) setSavedKeys((prev) => toggled(prev, key, false));
      }, SAVED_SHOWN_MS)
    );
  }, []);

  const writeSaved = useCallback((next: NoteMap) => {
    savedRef.current = next;
    setSaved(next);
    if (dataRef.current) rememberValue(MEMBERS_CACHE_KEY, withSavedNotes(dataRef.current, next));
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setFetching(true);
    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      const payload = (await response.json()) as { data?: MembersPayload; error?: { message?: string } };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to load members.");
      }
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      const next = rebaseNotes(
        notesFromMembers(payload.data.members),
        { drafts: draftsRef.current, saved: savedRef.current },
        touchedRef.current
      );
      dataRef.current = payload.data;
      setData(payload.data);
      writeDrafts(next.drafts);
      writeSaved(next.saved);
      setLoadError(null);
    } catch (error) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Failed to load members.");
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) setFetching(false);
    }
  }, [writeDrafts, writeSaved]);

  const persist = useCallback(
    async function persistNote(key: string, options: SaveOptions = {}): Promise<void> {
      const parsed = parseNoteKey(key);
      if (!parsed) return;
      if (inFlightRef.current.has(key)) {
        resaveRef.current.add(key);
        return;
      }
      const notes = (draftsRef.current[key] ?? "").slice(0, MEMBER_NOTE_MAX);
      if (notes === (savedRef.current[key] ?? "")) {
        // Typed back to what's already saved: nothing to send, and nothing failed any more.
        writeErrors((prev) => without(prev, key));
        return;
      }

      inFlightRef.current.add(key);
      setSavingKeys((prev) => toggled(prev, key, true));
      try {
        const response = await fetch("/api/members/notes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: parsed.userId, cycleNumber: parsed.cycleNumber, notes }),
          keepalive: options.keepalive
        });
        const payload = (await response.json()) as {
          data?: { userId: string; cycleNumber: number; notes: string };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Failed to save note.");
        }
        writeSaved({ ...savedRef.current, [key]: payload.data.notes });
        writeErrors((prev) => without(prev, key));
        flashSaved(key);
        if (Object.keys(errorKeysRef.current).length === 0) setSaveError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save note.";
        writeErrors((prev) => ({ ...prev, [key]: message }));
        setSaveError(message);
      } finally {
        inFlightRef.current.delete(key);
        setSavingKeys((prev) => toggled(prev, key, false));
        // Text typed while this save was out goes next, so the newest text always wins.
        if (resaveRef.current.delete(key)) await persistNote(key, options);
      }
    },
    [writeSaved, writeErrors, flashSaved]
  );

  const flushNote = useCallback(
    (key: string, options?: SaveOptions) => {
      const timer = timersRef.current.get(key);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(key);
      }
      void persist(key, options);
    },
    [persist]
  );

  /** Sends every note still waiting on its timer, plus every note whose last save failed. */
  const flushAll = useCallback(
    (options?: SaveOptions) => {
      const pending = [...timersRef.current.entries()];
      timersRef.current.clear();
      for (const [, timer] of pending) clearTimeout(timer);
      const keys = new Set([...pending.map(([key]) => key), ...Object.keys(errorKeysRef.current)]);
      for (const key of keys) void persist(key, options);
    },
    [persist]
  );

  const retryFailed = useCallback(() => {
    for (const key of Object.keys(errorKeysRef.current)) void persist(key);
  }, [persist]);

  const setNote = useCallback(
    (key: string, value: string) => {
      touchedRef.current.add(key);
      writeDrafts({ ...draftsRef.current, [key]: value.slice(0, MEMBER_NOTE_MAX) });
      const existing = timersRef.current.get(key);
      if (existing) clearTimeout(existing);
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          void persist(key);
        }, SAVE_DELAY_MS)
      );
    },
    [persist, writeDrafts]
  );

  useEffect(() => {
    if (initialData) {
      // Already fresh from the server: keep it as the last copy for a client-side return.
      rememberValue(MEMBERS_CACHE_KEY, initialData);
      return;
    }
    void load();
  }, [initialData, load]);

  // Leaving the page (route change, tab close, app switch) sends unsaved notes instead of dropping them.
  const flushAllRef = useRef(flushAll);
  useEffect(() => {
    flushAllRef.current = flushAll;
  }, [flushAll]);

  useEffect(() => {
    mountedRef.current = true;
    function flushOnHide() {
      if (document.visibilityState === "hidden") flushAllRef.current({ keepalive: true });
    }
    function flushOnPageHide() {
      flushAllRef.current({ keepalive: true });
    }
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnPageHide);
    const savedTimers = savedTimersRef.current;
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnPageHide);
      flushAllRef.current({ keepalive: true });
      for (const timer of savedTimers.values()) clearTimeout(timer);
      mountedRef.current = false;
    };
  }, []);

  const noteState = useCallback(
    (key: string): SaveStateValue => {
      if (savingKeys.has(key)) return "saving";
      if (key in errorKeys) return "error";
      if ((drafts[key] ?? "") !== (saved[key] ?? "")) return "dirty";
      if (savedKeys.has(key)) return "saved";
      return "idle";
    },
    [drafts, errorKeys, saved, savedKeys, savingKeys]
  );

  return {
    data,
    drafts,
    /** Nothing to show yet: no cached copy and the first load hasn't finished. */
    loading: data === null && loadError === null,
    fetching,
    loadError,
    saveError,
    dismissSaveError: () => setSaveError(null),
    retryFailed,
    savingKeys,
    errorKeys,
    noteState,
    reload: load,
    setNote,
    flushNote,
    flushAll
  };
}
