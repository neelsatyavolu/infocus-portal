"use client";

import { useEffect, useRef } from "react";

/** Things a person does to move the page themselves. After any of them we never scroll for them. */
const INTERACTIONS = ["wheel", "touchmove", "keydown", "pointerdown"] as const;

/**
 * PINs and Signature only exist after their GET succeeds, so a `/settings#pins` link has nothing
 * to land on at first. When a section in `visible` appears and the hash names it, scroll to it.
 * The two GETs finish in either order, so if PINs arrive after Signature and push it down, it
 * lands again. Once the person scrolls or clicks, a late fetch never moves them.
 */
export function useGatedHashScroll(visible: Record<string, boolean>) {
  const interactedRef = useRef(false);

  useEffect(() => {
    function markInteracted() {
      interactedRef.current = true;
    }
    for (const type of INTERACTIONS) window.addEventListener(type, markInteracted, { capture: true, passive: true });
    return () => {
      for (const type of INTERACTIONS) window.removeEventListener(type, markInteracted, { capture: true });
    };
  }, []);

  const key = Object.entries(visible)
    .filter(([, shown]) => shown)
    .map(([id]) => id)
    .join("|");

  useEffect(() => {
    if (interactedRef.current) return;
    const target = window.location.hash.slice(1);
    if (!target || !key.split("|").includes(target)) return;
    document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, [key]);
}
