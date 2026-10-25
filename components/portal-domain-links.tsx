"use client";

import { useEffect } from "react";
import { canonicalPortalDomain, linkOnCurrentPortalDomain, portalDomainOf } from "@/src/lib/hosts";

/**
 * On the old Portal domain (where the installed apps and kiosks stay), a click on a link to the
 * canonical domain opens the same page on this one. Fixed at click time, so server and browser
 * render the same links.
 */
export function PortalDomainLinks() {
  useEffect(() => {
    const host = window.location.hostname;
    if (!portalDomainOf(host) || portalDomainOf(host) === canonicalPortalDomain()) return;
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const moved = linkOnCurrentPortalDomain(anchor.href, host);
      if (moved) anchor.href = moved;
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
