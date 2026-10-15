"use client";

import { useEffect } from "react";

/**
 * Lifts the Portal's toasts clear of the call's own controls (the bottom bar, the phone rail, an
 * open side panel) through the Toaster's `--toast-offset-*` variables on <html>. Restored when the
 * call unmounts, so nothing leaks to other pages. Renders nothing.
 */
export function CallToastOffset({ bottom, right }: { bottom: string; right: string }) {
  useEffect(() => {
    const style = document.documentElement.style;
    const previous = {
      bottom: style.getPropertyValue("--toast-offset-bottom"),
      right: style.getPropertyValue("--toast-offset-right")
    };
    style.setProperty("--toast-offset-bottom", bottom);
    style.setProperty("--toast-offset-right", right);
    return () => {
      if (previous.bottom) style.setProperty("--toast-offset-bottom", previous.bottom);
      else style.removeProperty("--toast-offset-bottom");
      if (previous.right) style.setProperty("--toast-offset-right", previous.right);
      else style.removeProperty("--toast-offset-right");
    };
  }, [bottom, right]);
  return null;
}

/** Offsets for each layout: 16px above the bar (or beside the rail / an open desktop panel). */
export function callToastOffsets(form: "desktop" | "phone" | "rail", panelOpen: boolean) {
  if (form === "rail") return { bottom: "16px", right: "calc(88px + env(safe-area-inset-right))" };
  if (form === "phone") return { bottom: "calc(80px + env(safe-area-inset-bottom))", right: "16px" };
  return { bottom: "calc(88px + env(safe-area-inset-bottom))", right: panelOpen ? "384px" : "24px" };
}
