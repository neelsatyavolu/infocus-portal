"use client";

import { useLayoutEffect, useState } from "react";

/** Phones, and landscape phones too short for a corner card, get the full-screen sheet. */
const SHEET_QUERY = "(max-width: 639px), (max-height: 540px)";
const COARSE_QUERY = "(pointer: coarse)";
/** More than this much of the screen hidden under the visual viewport means the keyboard is up. */
const KEYBOARD_MIN_PX = 80;

export type PanelBox =
  | {
      mode: "sheet";
      /** Sized to window.visualViewport so the composer stays above the on-screen keyboard. */
      top: number;
      height: number;
      keyboard: boolean;
      coarse: boolean;
    }
  | {
      mode: "card";
      /** Height of the on-screen keyboard on touch tablets (0 when it is down). */
      keyboardInset: number;
      viewportHeight: number;
      coarse: boolean;
    };

function measure(): PanelBox {
  const coarse = window.matchMedia(COARSE_QUERY).matches;
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const top = viewport?.offsetTop ?? 0;
  if (window.matchMedia(SHEET_QUERY).matches) {
    return { mode: "sheet", top, height, keyboard: window.innerHeight - height > KEYBOARD_MIN_PX, coarse };
  }
  const covered = Math.max(0, window.innerHeight - height - top);
  return {
    mode: "card",
    keyboardInset: coarse && covered > KEYBOARD_MIN_PX ? covered : 0,
    viewportHeight: height,
    coarse
  };
}

function sameBox(a: PanelBox | null, b: PanelBox) {
  if (!a || a.mode !== b.mode || a.coarse !== b.coarse) {
    return false;
  }
  if (a.mode === "sheet" && b.mode === "sheet") {
    return a.top === b.top && a.height === b.height && a.keyboard === b.keyboard;
  }
  if (a.mode === "card" && b.mode === "card") {
    return a.keyboardInset === b.keyboardInset && a.viewportHeight === b.viewportHeight;
  }
  return false;
}

/**
 * Where the open panel goes: a full-screen sheet sized to the visual viewport (phones), or the
 * corner card (larger screens; lifted above the keyboard on touch tablets). Measured before
 * paint, so the panel never flashes in the wrong shape. null while closed.
 */
export function usePanelBox(open: boolean): PanelBox | null {
  const [box, setBox] = useState<PanelBox | null>(() => (open ? measure() : null));

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const update = () => {
      const next = measure();
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    update();
    const sheetMedia = window.matchMedia(SHEET_QUERY);
    const coarseMedia = window.matchMedia(COARSE_QUERY);
    sheetMedia.addEventListener("change", update);
    coarseMedia.addEventListener("change", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      sheetMedia.removeEventListener("change", update);
      coarseMedia.removeEventListener("change", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return open ? box : null;
}
