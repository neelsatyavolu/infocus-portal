"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Menu, Search } from "lucide-react";
import { HubIcon } from "@/components/hub-icon";
import { Kbd } from "@/components/kit/kbd";
import type { AppBreadcrumb } from "@/src/lib/app-breadcrumbs";
import { cn } from "@/src/lib/utils";
import { ShellBreadcrumbs, showsBreadcrumbTrail } from "@/components/shell/shell-breadcrumbs";
import { TOP_BAR_SLOT_ID } from "@/components/shell/top-bar-slot";
import { DRAWER_ID } from "@/components/shell/use-phone-drawer";
import type { ShellLinkClick } from "@/components/shell/use-shell-link";

const SQUARE_BUTTON =
  "grid h-10 w-10 shrink-0 place-items-center rounded-md text-foreground transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The 56px top bar, on the same line as the sidebar's brand row and the assets panel header.
 * Its row is the content column (same gutters and max width), so the first crumb starts on the
 * page's left edge and the last control ends on its right edge. Left: the hub's tabs on a page
 * that has them (Master Calendar / Cycle Dates…), otherwise breadcrumbs (two or more; a lone
 * crumb would repeat the page title), otherwise a slot a page can fill with its own view tabs
 * (TopBarSlot, e.g. the Grade Editor). Right: Search (⌘K) and the account menu, 36px
 * (40px on phones). Viewing as is told once, by the notice at the top of the column (with its
 * actions), plus the avatar's amber ring that stays in sight while the page scrolls. Page
 * controls such as the dashboard's workspace and Grid/List live in each page's toolbar.
 */
export function AppTopBar({
  crumbs,
  onLinkClick,
  pending,
  wide,
  showMenuButton,
  drawerOpen,
  onOpenDrawer,
  showSearch,
  onSearch,
  tabs,
  account
}: {
  crumbs: AppBreadcrumb[];
  onLinkClick: ShellLinkClick;
  /** A shell link navigation is in flight (draws the progress line). */
  pending: boolean;
  wide: boolean;
  /** No phone tab bar (App Review): the menu button opens the drawer instead. */
  showMenuButton: boolean;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  showSearch: boolean;
  onSearch: () => void;
  /** The hub's tabs, shown in place of the breadcrumbs. */
  tabs?: ReactNode;
  account: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="px-4 md:px-6">
        <div className={cn("mx-auto flex h-14 w-full min-w-0 items-center gap-2 md:gap-3", !wide && "max-w-[80rem]")}>
          {showMenuButton ? (
            <button
              type="button"
              className={cn(SQUARE_BUTTON, "-ml-2 lg:hidden")}
              onClick={onOpenDrawer}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls={DRAWER_ID}
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <Link
              href="/dashboard"
              aria-label="InFocus Portal home"
              className="-ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <HubIcon size={28} className="h-7 w-7" />
            </Link>
          )}
          {tabs ? (
            tabs
          ) : showsBreadcrumbTrail(crumbs) ? (
            <ShellBreadcrumbs crumbs={crumbs} onLinkClick={onLinkClick} />
          ) : (
            <div id={TOP_BAR_SLOT_ID} className="flex min-w-0 flex-1 self-stretch" />
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
            {showSearch ? (
              <button
                type="button"
                onClick={onSearch}
                aria-label="Search pages"
                aria-keyshortcuts="Meta+K Control+K"
                className={cn(
                  SQUARE_BUTTON,
                  "md:flex md:h-9 md:w-56 md:items-center md:justify-start md:gap-2 md:border md:border-input md:px-3 md:text-muted-foreground md:hover:text-foreground"
                )}
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden flex-1 text-left text-sm md:inline">Search…</span>
                <Kbd className="hidden md:inline-flex">⌘K</Kbd>
              </button>
            ) : null}
            {account}
          </div>
        </div>
      </div>
      {pending ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
          <span className="block h-full w-1/3 bg-[var(--brand-green)] motion-safe:animate-[loading-bar_1s_ease-in-out_infinite]" />
        </span>
      ) : null}
    </header>
  );
}
