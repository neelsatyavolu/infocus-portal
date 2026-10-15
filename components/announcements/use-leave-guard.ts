"use client";

import { useEffect, useRef } from "react";

/** The parts of a click on a link that decide whether it leaves the page in this tab. */
export type LinkClick = {
  defaultPrevented: boolean;
  button: number;
  modified: boolean;
  /** The link's resolved href, or null when the click wasn't on a link. */
  href: string | null;
  target: string;
  download: boolean;
};

type PageLocation = Pick<Location, "href" | "origin" | "pathname" | "search">;

/**
 * The in-app path (same origin, same tab) a plain left click is following, or null for clicks
 * the guard leaves alone: modified or non-left clicks, new-tab and download links, other sites,
 * and links to this page (a hash jump or the tab you're on).
 */
export function guardedHref(click: LinkClick, location: PageLocation) {
  if (click.defaultPrevented || click.button !== 0 || click.modified || !click.href) return null;
  if ((click.target && click.target !== "_self") || click.download) return null;
  let url: URL;
  try {
    url = new URL(click.href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

function linkClick(event: MouseEvent): LinkClick {
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  const link = anchor instanceof HTMLAnchorElement ? anchor : null;
  return {
    defaultPrevented: event.defaultPrevented,
    button: event.button,
    modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
    href: link?.href ?? null,
    target: link?.target ?? "",
    download: link?.hasAttribute("download") ?? false
  };
}

/**
 * While `active`, a plain click on an in-app link is stopped and handed to `onBlocked` instead
 * (beforeunload never fires for client-side navigation). It listens on window in the capture
 * phase, before Next's Link and the shell's links, which skip clicks that were prevented.
 */
export function useLeaveGuard(active: boolean, onBlocked: (href: string) => void) {
  const blockedRef = useRef(onBlocked);

  useEffect(() => {
    blockedRef.current = onBlocked;
  });

  useEffect(() => {
    if (!active) return;
    function onClick(event: MouseEvent) {
      const href = guardedHref(linkClick(event), window.location);
      if (!href) return;
      event.preventDefault();
      blockedRef.current(href);
    }
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [active]);
}
