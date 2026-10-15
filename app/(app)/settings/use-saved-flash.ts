"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A short-lived status word ("Saved", "Test email sent"). A new flash restarts the timer, so a
 * second save never has its word cut short by the first one's timer, and the timer is cleared on
 * unmount.
 */
export function useSavedFlash(durationMs = 1200) {
  const [label, setLabel] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const flash = useCallback(
    (text = "Saved") => {
      setLabel(text);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setLabel("");
      }, durationMs);
    },
    [durationMs]
  );

  return [label, flash] as const;
}
