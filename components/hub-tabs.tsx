import Link from "next/link";
import type { HubTab } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";

/** Tabs across the top of pages that share one sidebar link (DESIGN.md §10: 2px green underline). */
export function HubTabs({ tabs }: { tabs: HubTab[] }) {
  return (
    <nav aria-label="Section" className="-mt-1 mb-5 flex gap-6 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href as never}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-0.5 text-sm transition",
            tab.active
              ? "border-[var(--brand-green)] font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
