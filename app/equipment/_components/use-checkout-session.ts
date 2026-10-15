"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJson } from "@/components/equipment/equipment-api";

type SessionInfo = { unlocked: boolean; expiresAt?: number; remainingMs?: number };

/** The header tag turns amber this long before the station locks itself. */
const LOCK_WARNING_MS = 10 * 60 * 1000;

/**
 * The checkout station's one-hour Google session: checked on load, on window focus and on
 * `recheck()`. While unlocked it knows when the station locks (`expiresAt`), flags the last ten
 * minutes (`lockSoon`), and calls `onExpire` when the hour runs out.
 */
export function useCheckoutSession({ onExpire, onCheckFailed }: { onExpire: () => void; onCheckFailed: () => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [lockSoon, setLockSoon] = useState(false);
  // The latest callbacks, without restarting the timers when the page re-renders.
  const callbacks = useRef({ onExpire, onCheckFailed });
  useEffect(() => {
    callbacks.current = { onExpire, onCheckFailed };
  });

  useEffect(() => {
    let active = true;
    let lockTimer: ReturnType<typeof setTimeout> | undefined;
    let warnTimer: ReturnType<typeof setTimeout> | undefined;

    function schedule(remaining: number) {
      if (remaining > LOCK_WARNING_MS) {
        warnTimer = setTimeout(() => setLockSoon(true), remaining - LOCK_WARNING_MS);
      }
      lockTimer = setTimeout(() => {
        setUnlocked(false);
        callbacks.current.onExpire();
      }, remaining);
    }

    async function checkSession() {
      try {
        const data = await readJson<SessionInfo>(await fetch("/api/equipment/kiosk/session", { cache: "no-store" }));
        if (!active) return;
        clearTimeout(lockTimer);
        clearTimeout(warnTimer);
        setUnlocked(data.unlocked);
        if (!data.unlocked) {
          setExpiresAt(null);
          setLockSoon(false);
          return;
        }
        const remaining = data.remainingMs ?? 0;
        setExpiresAt(data.expiresAt ?? Date.now() + remaining);
        setLockSoon(remaining <= LOCK_WARNING_MS);
        schedule(remaining);
      } catch {
        if (active) {
          setUnlocked(false);
          callbacks.current.onCheckFailed();
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    void checkSession();
    window.addEventListener("focus", checkSession);
    return () => {
      active = false;
      clearTimeout(lockTimer);
      clearTimeout(warnTimer);
      window.removeEventListener("focus", checkSession);
    };
  }, [refreshKey]);

  const recheck = useCallback(() => setRefreshKey((value) => value + 1), []);
  /** The server refused or locked the station: show it locked at once (the next check confirms). */
  const markLocked = useCallback(() => setUnlocked(false), []);

  return { unlocked, checking, expiresAt, lockSoon, recheck, markLocked };
}
