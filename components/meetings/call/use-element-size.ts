"use client";

import { useCallback, useState } from "react";

/** Content-box size of an element, kept current with a ResizeObserver (callback ref). */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
