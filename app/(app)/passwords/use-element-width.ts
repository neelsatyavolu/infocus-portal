"use client";

import { useCallback, useState } from "react";

/**
 * Tracks an element's width with a ResizeObserver. Returns a callback ref and the width in px
 * (0 until measured, so the first render picks the narrow layout).
 */
export function useElementWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  // Measures when the element attaches and follows it until it detaches (ref cleanup).
  const ref = useCallback((element: T | null) => {
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
