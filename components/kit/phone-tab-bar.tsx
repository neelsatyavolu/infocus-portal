import Link from "next/link";
import type { ReactNode } from "react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { cn } from "@/src/lib/utils";

/**
 * Put this class on a standalone shell's root (outside AppShell) so fixed bottom elements
 * (StickyActionBar, toasts, docks) sit above the PhoneTabBar: `className={PHONE_TABBAR_ROOT_CLASS.lg}`.
 */
export const PHONE_TABBAR_ROOT_CLASS = {
  md: "[--phone-tabbar-h:3.75rem] md:[--phone-tabbar-h:0px]",
  lg: "[--phone-tabbar-h:3.75rem] lg:[--phone-tabbar-h:0px]"
} as const;

export type PhoneTab = {
  key: string;
  label: string;
  icon: KitIcon;
  active: boolean;
  href?: string;
  onSelect?: () => void;
  /** A StatusDot or CountBadge at the icon's corner ("something happened"). */
  badge?: ReactNode;
};

/**
 * The Portal's phone bottom tab bar for shells outside AppShell (/live, equipment): an icon over
 * an 11px label, a 2px green marker under the active tab, safe-area padding, hidden from
 * `hideFrom`. Pair the shell root with PHONE_TABBAR_ROOT_CLASS.
 */
export function PhoneTabBar({
  items,
  ariaLabel,
  hideFrom = "lg",
  className
}: {
  items: PhoneTab[];
  ariaLabel: string;
  hideFrom?: "md" | "lg";
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-[var(--ink)] pb-[env(safe-area-inset-bottom)]",
        hideFrom === "md" ? "md:hidden" : "lg:hidden",
        className
      )}
    >
      {items.map((item) => {
        const tabClass = cn(
          "flex h-[3.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          item.active ? "text-foreground" : "text-muted-foreground"
        );
        const body = (
          <>
            <span className="relative flex [&>svg]:size-5">
              {renderIcon(item.icon, "h-5 w-5")}
              {item.badge ? <span className="absolute -right-2 -top-1 flex">{item.badge}</span> : null}
            </span>
            <span className="max-w-full truncate px-1">{item.label}</span>
            <span aria-hidden className={cn("h-0.5 w-4", item.active ? "bg-[var(--brand-green)]" : "bg-transparent")} />
          </>
        );
        return item.href ? (
          <Link key={item.key} href={item.href as never} aria-current={item.active ? "page" : undefined} className={tabClass}>
            {body}
          </Link>
        ) : (
          <button key={item.key} type="button" onClick={item.onSelect} aria-current={item.active ? "page" : undefined} className={tabClass}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
