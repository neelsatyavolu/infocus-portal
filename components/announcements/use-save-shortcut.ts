"use client";

import { useEffect, useRef } from "react";

const OPEN_DIALOG = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * ⌘S / Ctrl+S calls `onSave` while `enabled`, and always stops the browser's "Save page" then
 * (even when there is nothing to save). `onSave` must check its own conditions. Ignored during
 * IME composition, with Shift or Alt held, and while a dialog is open.
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean) {
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || !(event.metaKey || event.ctrlKey)) return;
      if (event.altKey || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (document.querySelector(OPEN_DIALOG)) return;
      saveRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
