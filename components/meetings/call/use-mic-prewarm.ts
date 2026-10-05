"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a pre-warm keeps the mic open if the person doesn't unmute. */
const PREWARM_MS = 4000;

/**
 * Unmuting re-opens the mic (retainIdleTrack is off), which takes ~100–300 ms and could clip the
 * first syllable. Hovering or focusing the mic button, or pressing ⌘/Ctrl (the start of the ⌘D
 * shortcut), opens the source for local monitoring only a moment early, so unmute is instant.
 * Nothing is sent while muted. Closes again after 4 s without an unmute.
 */
export function useMicPrewarm(audioOn: boolean) {
  const [prewarm, setPrewarm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMicIntent = useCallback(() => {
    if (audioOn) return;
    setPrewarm(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPrewarm(false), PREWARM_MS);
  }, [audioOn]);

  useEffect(() => {
    if (audioOn) setPrewarm(false);
  }, [audioOn]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Meta" || event.key === "Control") onMicIntent();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onMicIntent]);

  return { prewarm, onMicIntent };
}
