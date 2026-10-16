"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The top bar's left slot (AppTopBar renders it when the page has no hub tabs or crumb trail). */
export const TOP_BAR_SLOT_ID = "app-top-bar-slot";

/**
 * Puts a page's own view tabs in the 56px top bar, like the shell's hub tabs, so they take no
 * row on the page. Renders nothing until mounted (the slot is outside the page) or when the bar
 * has no free slot (a crumb trail is showing).
 */
export function TopBarSlot({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, findSlot, noSlot);
  return target ? createPortal(children, target) : null;
}

// The bar is rendered by the shell before the page, so the slot is there once the page mounts.
const subscribe = () => () => {};
const findSlot = () => document.getElementById(TOP_BAR_SLOT_ID);
const noSlot = () => null;
