"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { centerInStrip, rovingIndex } from "@/components/kit/roving";
import { CountBadge, StatusDot, type CountBadgeTone, type StatusDotTone } from "@/components/kit/status-tag";
import { TAB_LIST_CLASS, tabItemClass } from "@/components/kit/tab-styles";
import { cn } from "@/src/lib/utils";

export type ViewTabItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** Count after the label (unread, waiting). */
  count?: number;
  countTone?: CountBadgeTone;
  countLabel?: string;
  /** "Something happened here" dot instead of a number. */
  dot?: StatusDotTone;
  dotLabel?: string;
  disabled?: boolean;
  title?: string;
};

/** Element ids shared by a ViewTabs strip and its ViewTabPanels. */
export function viewTabIds(prefix: string, value: string) {
  return { tab: `${prefix}-tab-${value}`, panel: `${prefix}-panel-${value}` };
}

/**
 * In-page view tabs that look exactly like the shell's HubTabs (h-10, 2px green underline) but
 * switch local state instead of routes: role=tablist, ←/→/Home/End, the active tab scrolled into
 * view on phones, and an optional count or dot per tab. Pair with ViewTabPanel (same idPrefix).
 */
export function ViewTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  size = "md",
  className
}: {
  items: Array<ViewTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Connects tabs to ViewTabPanels. Defaults to a generated id (then panels can't link). */
  idPrefix?: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const generated = useId();
  const prefix = idPrefix ?? generated;
  const strip = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = items.findIndex((item) => item.value === value);
  // With no match, the first enabled tab takes the tab stop so the strip stays reachable.
  const tabStop = selectedIndex >= 0 ? selectedIndex : Math.max(0, items.findIndex((item) => !item.disabled));

  // Only when the selection changes, so a re-render never snaps back a strip the user scrolled.
  useEffect(() => {
    centerInStrip(strip.current, refs.current[selectedIndex] ?? null);
  }, [selectedIndex]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(index, event.key, items.map((item) => Boolean(item.disabled)));
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].value);
  }

  return (
    <div ref={strip} role="tablist" aria-label={ariaLabel} className={cn(TAB_LIST_CLASS, className)}>
      {items.map((item, index) => {
        const active = item.value === value;
        const ids = viewTabIds(prefix, item.value);
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={idPrefix ? ids.panel : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={tabItemClass(active, size)}
          >
            {item.label}
            {item.count ? (
              <CountBadge count={item.count} tone={item.countTone ?? "neutral"} srLabel={item.countLabel} />
            ) : item.dot ? (
              <StatusDot tone={item.dot} size={6} label={item.dotLabel} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The panel for one ViewTabs value. Inactive panels stay mounted but hidden. */
export function ViewTabPanel({
  idPrefix,
  value,
  active,
  className,
  children
}: {
  idPrefix: string;
  value: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ids = viewTabIds(idPrefix, value);
  return (
    <div
      role="tabpanel"
      id={ids.panel}
      aria-labelledby={ids.tab}
      hidden={!active}
      tabIndex={0}
      className={cn("rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {children}
    </div>
  );
}
