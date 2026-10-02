"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * The tab pill at the bottom of a page (cycles, group stages, grade views).
 * Desktop (lg+): floats at the bottom of the page column, as before.
 * Phones and tablets: fixed above the home indicator, clear of the ✱ assistant button
 * (bottom right), and scrolls sideways inside itself so every tab stays reachable.
 * Pages already reserve `pb-24` below `lg` (AppShell's main), which clears it.
 */
export function BottomTabDock({
  activeKey,
  label,
  children
}: {
  /** Changes when the selected tab changes; scrolls that tab into view. */
  activeKey: string | number;
  label: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scroller.current;
    const active = container?.querySelector<HTMLElement>("[data-active='true']");
    if (!container || !active) return;
    // Horizontal only: scrollIntoView could also scroll the page.
    container.scrollLeft = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
  }, [activeKey]);

  return (
    <nav
      aria-label={label}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex justify-center",
        // Room for the 48px ✱ button at right-[max(1.25rem,…)].
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[calc(max(1.25rem,env(safe-area-inset-right))+3.5rem)]",
        "lg:sticky lg:inset-x-auto lg:bottom-4 lg:z-20 lg:mx-auto lg:px-2"
      )}
    >
      <div
        ref={scroller}
        className="pointer-events-auto max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-foreground/[0.08] bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-center gap-1">{children}</div>
      </div>
    </nav>
  );
}

function itemClass(active: boolean) {
  return cn(
    "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.11em] transition sm:px-4 sm:text-[12px] lg:min-h-0",
    active
      ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
      : "text-[var(--ink-text)] hover:bg-foreground/5 hover:text-foreground"
  );
}

export function BottomTabDockButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} data-active={active} aria-pressed={active} className={itemClass(active)}>
      {children}
    </button>
  );
}

export function BottomTabDockLink({ active, href, children }: { active: boolean; href: string; children: ReactNode }) {
  return (
    <Link
      href={href as never}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className={itemClass(active)}
    >
      {children}
    </Link>
  );
}

/** "Cycle 01" with the number chip, as every cycle dock shows it. */
export function CycleTabLabel({ cycleNumber, active }: { cycleNumber: number; active: boolean }) {
  return (
    <>
      Cycle
      <span
        className={cn(
          "rounded px-1.5 py-0.5 font-mono-broadcast tabular-nums text-[10px] font-medium",
          active ? "bg-black/25 text-[var(--on-brand)]" : "bg-foreground/10 text-[var(--ink-text)]"
        )}
      >
        {String(cycleNumber).padStart(2, "0")}
      </span>
    </>
  );
}
