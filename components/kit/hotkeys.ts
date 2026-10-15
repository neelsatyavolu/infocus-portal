"use client";

import { useEffect, useRef } from "react";
import { listShortcut } from "@/src/lib/keyboard-nav";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True when a key press belongs to a text field, select or rich-text editor. */
export function isTypingTarget(target: EventTarget | null) {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return Boolean(element && (TYPING_TAGS.has(element.tagName ?? "") || element.isContentEditable));
}

/**
 * True while a dialog or sheet is open, so page shortcuts stay out of its way. A docked,
 * non-modal Sheet (`data-nonmodal`) doesn't count: the page beside it stays usable.
 */
function dialogOpen() {
  return (
    typeof document !== "undefined" &&
    document.querySelector(
      '[role="dialog"][data-state="open"]:not([data-nonmodal]), [role="alertdialog"][data-state="open"]'
    ) !== null
  );
}

/** A single-key page shortcut should fire: no modifiers, not typing, not already handled. */
export function shouldHandleHotkey(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented" | "target" | "isComposing">) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || event.isComposing) return false;
  return !isTypingTarget(event.target);
}

/**
 * Single-key page shortcuts (`{ "/": focusSearch, "-": collapseAll }`). Skips presses with a
 * modifier, inside text fields, already handled, or while a dialog is open. Keys are matched
 * case-insensitively against `event.key`.
 */
export function useHotkeys(
  map: Record<string, (event: KeyboardEvent) => void>,
  { enabled = true, allowInDialogs = false }: { enabled?: boolean; allowInDialogs?: boolean } = {}
) {
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldHandleHotkey(event)) return;
      if (!allowInDialogs && dialogOpen()) return;
      const handler = latest.current[event.key] ?? latest.current[event.key.toLowerCase()];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, allowInDialogs]);
}

/** J / K (next / previous) for lists and queues, built on src/lib/keyboard-nav.ts. */
export function useListHotkeys({
  onNext,
  onPrevious,
  enabled = true
}: {
  onNext: () => void;
  onPrevious: () => void;
  enabled?: boolean;
}) {
  const latest = useRef({ onNext, onPrevious });
  useEffect(() => {
    latest.current = { onNext, onPrevious };
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || dialogOpen()) return;
      const shortcut = listShortcut(event);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "next") latest.current.onNext();
      else latest.current.onPrevious();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
