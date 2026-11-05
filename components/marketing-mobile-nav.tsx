"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PUBLIC_CONTAINER } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

export type MarketingNavItem = {
  href: string;
  label: string;
  key: string;
  external: boolean;
  /** Menu group: Portal pages (sign-in) or Tools (other apps). Ungrouped items come last. */
  group?: "portal" | "tools";
  /** Pass false for sign-in pages, so signed-out visitors don't prefetch a redirect. */
  prefetch?: boolean;
};

const MENU_ID = "marketing-menu";
const GROUP_LABEL = { portal: "Portal", tools: "Tools" } as const;
const GROUP_ORDER = ["portal", "tools", undefined] as const;

function groupItems(items: MarketingNavItem[]) {
  return GROUP_ORDER.map((group) => ({
    key: group ?? "other",
    label: group ? GROUP_LABEL[group] : null,
    items: items.filter((item) => item.group === group)
  })).filter((section) => section.items.length > 0);
}

function MenuLink({ item, active, onNavigate }: { item: MarketingNavItem; active: boolean; onNavigate: () => void }) {
  const className = cn(
    "relative -mx-3 flex h-11 items-center gap-2 rounded-md px-3 text-[15px] transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    active
      ? "font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-[var(--brand-green)]"
      : "text-[var(--ink-text)] hover:text-foreground"
  );

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onNavigate}>
        {item.label}
        <ArrowUpRight className="ml-auto h-4 w-4 opacity-60" aria-hidden />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <Link
      href={item.href as Route}
      prefetch={item.prefetch}
      aria-current={active ? "page" : undefined}
      className={className}
      onClick={onNavigate}
    >
      {item.label}
    </Link>
  );
}

/**
 * The header menu below xl: a ghost toggle (always the last item in the header row) and a panel
 * that drops under the sticky header, aligned to the page column. Closes on a link click,
 * Escape (focus returns to the toggle) or a click outside. `footer` is the signed-in account
 * block from the server.
 */
export function MarketingMobileNav({
  items,
  active,
  footer
}: {
  items: MarketingNavItem[];
  active?: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const close = () => setOpen(false);
  const sections = groupItems(items);

  return (
    // Not `relative`: the panel resolves against the sticky <header>, so it spans the full width.
    <div ref={rootRef} className="xl:hidden">
      <button
        ref={toggleRef}
        type="button"
        // 40px touch target on phones, matching the header's outline button there; 36px from sm.
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "max-sm:size-10")}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
      </button>
      <div
        id={MENU_ID}
        hidden={!open}
        className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-y-auto border-b border-border bg-background"
      >
        <div className={cn(PUBLIC_CONTAINER, "pb-4 pt-2")}>
          <nav aria-label="Site">
            {sections.map((section) => (
              <div key={section.key} className="py-1">
                {section.label ? (
                  <p className="flex h-8 items-center text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
                    {section.label}
                  </p>
                ) : null}
                <ul>
                  {section.items.map((item) => (
                    <li key={item.key}>
                      <MenuLink item={item} active={active === item.key} onNavigate={close} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          {footer}
        </div>
      </div>
    </div>
  );
}
