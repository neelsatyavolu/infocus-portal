"use client";

import { useSyncExternalStore, type KeyboardEvent } from "react";
import { cn } from "@/src/lib/utils";

/** True for Cmd+Enter (Mac) or Ctrl+Enter, ignoring Enter that commits an IME composition. */
export function isSubmitShortcut(event: KeyboardEvent<HTMLElement>) {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing;
}

function subscribeNever() {
  return () => undefined;
}

function detectMac() {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Muted "⌘↵ to send" hint under a multi-line box; shows "Ctrl+Enter" off Apple devices. */
export function SubmitShortcutHint({ action = "send", className }: { action?: string; className?: string }) {
  // Render the Mac label on the server and first paint, then correct it after mount (no hydration mismatch).
  const isMac = useSyncExternalStore(subscribeNever, detectMac, () => true);

  return (
    <span className={cn("text-[11px] text-muted-foreground", className)}>
      {isMac ? "⌘↵" : "Ctrl+Enter"} to {action}
    </span>
  );
}
