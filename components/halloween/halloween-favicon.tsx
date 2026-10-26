"use client";

import { useEffect } from "react";
import { useHalloweenActive } from "@/src/lib/use-halloween";

const ICON_LINKS = 'link[rel~="icon"], link[rel="apple-touch-icon"]';

/** Points the tab icons at their pumpkin versions (public/halloween/) while the season is on. */
export function HalloweenFavicon() {
  const active = useHalloweenActive();

  useEffect(() => {
    if (!active) return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>(ICON_LINKS)).filter((link) =>
      link.getAttribute("href")?.startsWith("/favicon/")
    );
    const originals = links.map((link) => link.getAttribute("href") ?? "");
    links.forEach((link, index) => link.setAttribute("href", originals[index].replace("/favicon/", "/halloween/")));
    return () => links.forEach((link, index) => link.setAttribute("href", originals[index]));
  }, [active]);

  return null;
}
