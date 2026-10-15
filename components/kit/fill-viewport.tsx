"use client";

import { useEffect, useRef, type ReactNode } from "react";

const BOTTOM_GAP_PX = 16;
/** Below this the measured height would be cramped; the sticky max height alone takes over. */
const MIN_FILL_PX = 320;

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let current = node?.parentElement ?? null; current; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
  }
  return null;
}

/**
 * Sets `--fill-viewport-h` on its element: the window height left below where the element sits
 * when the page is scrolled to the top, less a 16px gap. A sticky list capped at that height ends
 * just above the bottom of the window, so a list page opens without a page scroll.
 */
export function FillViewport({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const parent = scrollParent(node);
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const top = node.getBoundingClientRect().top + (parent?.scrollTop ?? 0) + window.scrollY;
        const available = window.innerHeight - top - BOTTOM_GAP_PX;
        if (available >= MIN_FILL_PX) node.style.setProperty("--fill-viewport-h", `${Math.floor(available)}px`);
        else node.style.removeProperty("--fill-viewport-h");
      });
    };
    measure();
    // The header above can change height (wrapping, alerts), which moves where the list starts.
    const observer = new ResizeObserver(measure);
    if (node.parentElement?.parentElement) observer.observe(node.parentElement.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
