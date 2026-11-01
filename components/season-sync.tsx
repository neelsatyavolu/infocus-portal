"use client";

import { useEffect } from "react";
import { applySeasonClasses } from "@/src/lib/thanksgiving";
import { useHalloweenActive } from "@/src/lib/use-halloween";
import { useThanksgivingActive } from "@/src/lib/use-thanksgiving";

const ICON_LINKS = 'link[rel~="icon"], link[rel="apple-touch-icon"]';
/** A moment past local midnight, so the date has surely changed. */
const PAST_MIDNIGHT_MS = 1_000;

function msUntilMidnight(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime() + PAST_MIDNIGHT_MS;
}

/**
 * Keeps the seasonal theme in step in every open tab: switches the season at local midnight and
 * when the tab comes back (a tab left open from October 31 turns to Thanksgiving on its own), and
 * points the tab icons at the season's versions (public/halloween/, public/thanksgiving/).
 */
export function SeasonSync() {
  const halloween = useHalloweenActive();
  const thanksgiving = useThanksgivingActive();
  const folder = thanksgiving ? "/thanksgiving/" : halloween ? "/halloween/" : null;

  useEffect(() => {
    let timer = 0;
    function schedule() {
      timer = window.setTimeout(() => {
        applySeasonClasses();
        schedule();
      }, msUntilMidnight(new Date()));
    }
    function onVisible() {
      if (!document.hidden) applySeasonClasses();
    }
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!folder) return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>(ICON_LINKS)).filter((link) =>
      link.getAttribute("href")?.startsWith("/favicon/")
    );
    const originals = links.map((link) => link.getAttribute("href") ?? "");
    links.forEach((link, index) => link.setAttribute("href", originals[index].replace("/favicon/", folder)));
    return () => links.forEach((link, index) => link.setAttribute("href", originals[index]));
  }, [folder]);

  return null;
}
