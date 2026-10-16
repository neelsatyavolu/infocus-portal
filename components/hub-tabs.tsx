import Link from "next/link";
import { CountBadge, StatusDot, type CountBadgeTone, type StatusDotTone } from "@/components/kit/status-tag";
import { TAB_LIST_CLASS, tabItemClass } from "@/components/kit/tab-styles";
import type { HubTab } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";

/** A hub tab plus an optional status: a count (requests waiting on you) or a "something new" dot. */
export type HubTabWithStatus = HubTab & {
  count?: number;
  /** Screen-reader meaning of the count, e.g. "3 sign-up requests waiting". */
  countLabel?: string;
  /** `brand` (default): waiting on you. `neutral` for a plain total. */
  countTone?: CountBadgeTone;
  dot?: StatusDotTone;
  dotLabel?: string;
};

/**
 * Tabs across the top of pages that share one sidebar link (DESIGN.md §10: 2px green underline).
 * The shell renders them in the top bar, in place of the breadcrumbs, so they take no room from
 * the page; their underline sits on the bar's bottom line. In-page views use ViewTabs
 * (components/kit/view-tabs.tsx), which looks the same.
 */
export function HubTabs({ tabs }: { tabs: HubTabWithStatus[] }) {
  return (
    <nav aria-label="Section" className={cn(TAB_LIST_CLASS, "h-14 flex-1 gap-5 self-end border-b-0 md:gap-6")}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href as never}
          aria-current={tab.active ? "page" : undefined}
          className={cn(tabItemClass(tab.active), "mb-0 h-14")}
        >
          {tab.label}
          {tab.count ? (
            <CountBadge count={tab.count} tone={tab.countTone ?? "brand"} srLabel={tab.countLabel} />
          ) : tab.dot ? (
            <StatusDot tone={tab.dot} size={6} label={tab.dotLabel} />
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
