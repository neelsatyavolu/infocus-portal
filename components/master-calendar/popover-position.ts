import type { CSSProperties } from "react";
import { clampMenuPosition } from "@/src/lib/menu-position";
import type { Anchor } from "@/components/master-calendar/calendar-model";

const PHONE_MAX_WIDTH = 640;

function lengthToPx(value: string) {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return 0;
  if (trimmed.endsWith("rem")) {
    return number * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  }
  return number;
}

/** Height of the shell's phone tab bar (0 from lg up), read from --phone-tabbar-h on #main. */
function phoneTabbarHeight() {
  if (typeof document === "undefined") return 0;
  const host = document.getElementById("main") ?? document.documentElement;
  return lengthToPx(getComputedStyle(host).getPropertyValue("--phone-tabbar-h"));
}

/**
 * Where a fixed popover goes. Below 640px it is pinned to the top of the screen (the on-screen
 * keyboard covers the bottom); otherwise it opens at the anchor, kept inside the viewport and
 * above the phone tab bar.
 */
export function fixedPopoverStyle(anchor: Anchor, size: { width: number; height: number }): CSSProperties {
  if (window.innerWidth < PHONE_MAX_WIDTH) {
    return { top: "calc(env(safe-area-inset-top) + 0.5rem)", left: "1rem", right: "1rem", width: "auto" };
  }
  const position = clampMenuPosition({ x: anchor.left, y: anchor.top }, size, {
    width: window.innerWidth,
    height: window.innerHeight - phoneTabbarHeight()
  });
  return { left: position.x, top: position.y };
}

/** Closes a popover on a press outside it or on Escape (Escape is marked handled). */
export function dismissListeners(container: () => HTMLElement | null, onDismiss: () => void) {
  function handleMouseDown(event: MouseEvent) {
    const element = container();
    if (element && !element.contains(event.target as Node)) onDismiss();
  }
  function handleKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
    }
  }
  window.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("keydown", handleKey);
  return () => {
    window.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("keydown", handleKey);
  };
}
