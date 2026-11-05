import { CountBadge, StatusDot, StatusTag } from "@/components/kit/status-tag";
import type { NavSignal } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";

/**
 * The right-hand status column of a sidebar item: at most one mark, right-aligned in a fixed
 * min-width, so counts, dots and tags line up down the sidebar. Counts use the same filled
 * CountBadge as the hub tabs and phone tabs (`onBrand` on the active green item); tags are the
 * standard 11px StatusTag; LIVE is the one Record Red mark on screen.
 */
export function NavStatusSlot({ signal, active }: { signal: NavSignal | undefined; active: boolean }) {
  const mark = signal?.count ? (
    <CountBadge count={signal.count} tone={active ? "onBrand" : "brand"} srLabel={signal.countLabel ?? signal.label} />
  ) : signal?.tag ? (
    <StatusTag tone={signal.tag.tone} srLabel={`${signal.label}: `}>
      {signal.tag.label}
    </StatusTag>
  ) : signal?.dot ? (
    <StatusDot tone="new" size={6} label={signal.label} className={cn(active && "bg-[var(--on-brand)]")} />
  ) : null;
  return <span className="ml-auto flex min-w-6 shrink-0 items-center justify-end">{mark}</span>;
}

/** The 8px dot on a rail icon or phone tab when the item has any signal (red only when live). */
export function NavCornerDot({ signal, className }: { signal: NavSignal | undefined; className?: string }) {
  if (!signal) return null;
  return <StatusDot tone={signal.dotTone === "live" ? "live" : "new"} size={8} className={className} />;
}

/** Phone tab mark: counts as a tiny mono tag, everything else as an 8px dot. Decorative; the tab says it in words. */
export function TabSignal({ signal }: { signal: NavSignal | undefined }) {
  if (!signal) return null;
  if (signal.count) {
    return (
      <span aria-hidden className="pointer-events-none absolute -right-2.5 -top-1.5 flex">
        <CountBadge count={signal.count} tone="brand" />
      </span>
    );
  }
  return <NavCornerDot signal={signal} className="pointer-events-none absolute -right-1 -top-0.5" />;
}
