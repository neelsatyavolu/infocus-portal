"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { centerInStrip } from "@/components/kit/roving";
import { cn } from "@/src/lib/utils";
import { showHref, type StripItem } from "./show-overview";

function fullyVisible(strip: HTMLElement, child: HTMLElement) {
  return child.offsetLeft >= strip.scrollLeft && child.offsetLeft + child.offsetWidth <= strip.scrollLeft + strip.clientWidth;
}

/**
 * A plain click swaps `?date=` in place (history.replaceState, which Next keeps in sync with
 * useSearchParams), so the page shows the saved copy at once and loads the rest in the background,
 * with no server round trip. Modified clicks still open the show in a new tab or window.
 */
function selectShow(event: MouseEvent<HTMLAnchorElement>, item: StripItem, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  if (!item.active) window.history.replaceState(null, "", href);
}

/**
 * The upcoming shows as equal cells: they fill the column on desktop and scroll sideways inside
 * the strip (never the page) when there isn't room. The chosen show stays in the address (reload
 * and share keep it). The open show is marked like a tab: card fill and a 2px green underline.
 * `disabled` dims it and stops switching (while a save for the open show runs). `hrefFor` is each show's
 * address (The Show's by default; Editing keeps its own page and view).
 */
export function ShowDateStrip({
  items,
  disabled = false,
  hrefFor = showHref
}: {
  items: StripItem[];
  disabled?: boolean;
  hrefFor?: (date: string) => string;
}) {
  const stripRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const activeDate = items.find((item) => item.active)?.date;

  useEffect(() => {
    const strip = stripRef.current;
    const active = activeRef.current;
    if (strip && active && !fullyVisible(strip, active)) centerInStrip(strip, active);
  }, [activeDate]);

  return (
    <nav
      aria-label="Upcoming shows"
      inert={disabled}
      aria-busy={disabled || undefined}
      className={cn("min-w-0 transition-opacity", disabled && "opacity-60")}
    >
      <ol
        ref={stripRef}
        className="relative grid snap-x snap-mandatory auto-cols-[minmax(6.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto [scrollbar-width:thin]"
      >
        {items.map((item) => (
          <li key={item.date} className="min-w-0 snap-start">
            <a
              ref={item.active ? activeRef : undefined}
              href={hrefFor(item.date)}
              aria-current={item.active ? "page" : undefined}
              onClick={(event) => selectShow(event, item, hrefFor(item.date))}
              className={cn(
                "group relative flex h-16 min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-md border border-border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                item.active
                  ? "bg-card after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand-green)]"
                  : "hover:bg-[var(--ink-3)]"
              )}
            >
              <span
                className={cn(
                  "truncate text-sm",
                  item.active ? "font-semibold text-foreground" : "font-medium text-muted-foreground group-hover:text-foreground"
                )}
              >
                {item.primary}
              </span>
              <span className="truncate text-xs text-muted-foreground">{item.secondary}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
