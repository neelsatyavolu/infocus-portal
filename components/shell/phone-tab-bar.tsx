"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import type { NavSignals, SidebarNavItem } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";
import { isNavItemActive, navIconFor } from "@/components/shell/nav-items";
import { TabSignal } from "@/components/shell/nav-signal";

const TAB_CLASS =
  "flex h-[3.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * The phone and tablet tab bar (below 1024px): the person's first four tabs plus More, which
 * opens the full menu. Signals sit on each icon's corner; More carries a dot when something
 * outside the bar changed. Fixed elements elsewhere sit above it via --phone-tabbar-h.
 */
export function PhoneTabBar({
  tabs,
  signals,
  pathname,
  onMeetHost,
  isProducer,
  moreUpdates,
  moreLive,
  drawerOpen,
  onOpenMore
}: {
  tabs: SidebarNavItem[];
  signals: NavSignals;
  pathname: string;
  onMeetHost: boolean;
  isProducer: boolean;
  /** Items outside the bar with a signal. */
  moreUpdates: number;
  moreLive: boolean;
  drawerOpen: boolean;
  onOpenMore: () => void;
}) {
  return (
    <nav
      aria-label="Main tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((tab) => {
        const Icon = navIconFor(tab.id, isProducer);
        const active = isNavItemActive(tab, pathname, onMeetHost, isProducer);
        const signal = signals[tab.id];
        return (
          <Link
            key={tab.id}
            href={tab.href as never}
            aria-current={active ? "page" : undefined}
            className={cn(TAB_CLASS, active ? "text-foreground" : "text-muted-foreground")}
          >
            <span className="relative flex">
              <Icon className="h-5 w-5" aria-hidden />
              <TabSignal signal={signal} />
            </span>
            <span className="max-w-full truncate px-1">{tab.label}</span>
            {signal ? <span className="sr-only">{signal.label}</span> : null}
            <span aria-hidden className={cn("h-0.5 w-4", active ? "bg-[var(--brand-green)]" : "bg-transparent")} />
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        aria-controls="app-sidebar"
        aria-expanded={drawerOpen}
        aria-label={moreUpdates > 0 ? `More, ${moreUpdates} ${moreUpdates === 1 ? "update" : "updates"}` : undefined}
        className={cn(TAB_CLASS, "text-muted-foreground")}
      >
        <span className="relative flex">
          <Menu className="h-5 w-5" aria-hidden />
          {moreUpdates > 0 ? (
            <TabSignal signal={{ label: "", dotTone: moreLive ? "live" : "new" }} />
          ) : null}
        </span>
        More
        <span aria-hidden className="h-0.5 w-4" />
      </button>
    </nav>
  );
}
