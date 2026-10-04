"use client";

/**
 * Focus rings should only appear for keyboard users. Radix dialogs and popovers move focus to
 * their first control when they open, and some browsers then match :focus-visible even though
 * the person clicked, so a ring shows on (for example) the first switch. When the opening input
 * was a pointer, focus the panel itself instead; keyboard users keep the normal first-control focus.
 */

let lastPointer = false;
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pointerdown", () => (lastPointer = true), true);
  window.addEventListener("keydown", () => (lastPointer = false), true);
}

listen();

/** For `onOpenAutoFocus` on Radix Dialog/Popover content. */
export function pointerSafeAutoFocus(event: Event) {
  if (!lastPointer) return;
  event.preventDefault();
  const panel = event.target as HTMLElement | null;
  panel?.focus?.({ preventScroll: true });
}
