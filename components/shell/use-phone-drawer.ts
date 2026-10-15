"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The sidebar element the drawer is (AppSidebar's id; the menu and More buttons' aria-controls). */
export const DRAWER_ID = "app-sidebar";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside the open drawer, wrapping at either end. */
function trapTab(event: KeyboardEvent) {
  const drawer = document.getElementById(DRAWER_ID);
  if (!drawer) return;
  const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const inside = active instanceof Node && drawer.contains(active);
  if (event.shiftKey && (active === first || !inside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * The phone and tablet menu drawer (the sidebar below 1024px), a modal while open: Escape closes
 * it, Tab stays inside it, the page behind it stops scrolling, and it closes on navigation and
 * when the screen grows to the desktop layout. `dismissDrawer` (Escape, the X, the scrim) puts
 * focus back on the button that opened it; `closeDrawer` (a link in it) leaves focus to the page.
 */
export function usePhoneDrawer(pathname: string) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [drawerPathname, setDrawerPathname] = useState(pathname);
  if (pathname !== drawerPathname) {
    setDrawerPathname(pathname);
    setOpen(false);
  }

  const openDrawer = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const dismissDrawer = useCallback(() => {
    setOpen(false);
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    if (trigger) window.requestAnimationFrame(() => trigger.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissDrawer();
      else if (event.key === "Tab") trapTab(event);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, dismissDrawer]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return { open, openDrawer, closeDrawer, dismissDrawer };
}
