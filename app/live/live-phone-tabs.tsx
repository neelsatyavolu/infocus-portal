import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { HIDE_WHILE_TYPING } from "./live-controls";

export type LivePhoneTab = {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** A StatusDot at the icon's corner ("something happened"). */
  badge?: ReactNode;
  onSelect: () => void;
};

/**
 * The /live phone tab bar, drawn like the Portal's PhoneTabBar (an icon over an 11px label, a 2px
 * green marker under the active tab, safe-area padding), hidden from md. These buttons switch the
 * view in place rather than navigate, so they carry aria-pressed, not aria-current="page".
 * Pair the page root with PHONE_TABBAR_ROOT_CLASS.md so fixed bars sit above it. It steps aside
 * while a text field has focus (the page root needs `group/live`).
 */
export function LivePhoneTabs({ items, ariaLabel }: { items: LivePhoneTab[]; ariaLabel: string }) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] md:hidden",
        HIDE_WHILE_TYPING
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={item.active}
            onClick={item.onSelect}
            className={cn(
              "flex h-[3.75rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              item.active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <span className="relative flex">
              <Icon aria-hidden className="h-5 w-5" />
              {item.badge ? <span className="absolute -right-2 -top-1 flex">{item.badge}</span> : null}
            </span>
            <span className="max-w-full truncate px-1">{item.label}</span>
            <span aria-hidden className={cn("h-0.5 w-4", item.active ? "bg-[var(--brand-green)]" : "bg-transparent")} />
          </button>
        );
      })}
    </nav>
  );
}
