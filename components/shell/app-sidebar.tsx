"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { X } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { useMediaQuery } from "@/components/kit/remembered-state";
import type { NavSignals, SidebarNavItem, SidebarNavSection } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";
import { isNavItemActive, navIconFor } from "@/components/shell/nav-items";
import { SidebarNavLink } from "@/components/shell/sidebar-nav-link";
import { DRAWER_ID } from "@/components/shell/use-phone-drawer";

function SectionLabel({ label, rail }: { label: string; rail: boolean }) {
  return (
    <>
      <div
        className={cn(
          "mt-[0.675rem] px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground",
          rail && "lg:hidden"
        )}
      >
        {label}
      </div>
      {rail ? <div aria-hidden className="mx-2 my-2 hidden border-t border-border lg:block" /> : null}
    </>
  );
}

/**
 * The app sidebar: brand row (56px, on the same line as the top bar), the role's sections from
 * buildSidebarNav with one status slot per item, and Admin/Settings pinned at the bottom. Below
 * 1024px it is the drawer (More / the menu button): a modal dialog while open (focus moves to
 * its close button), and hidden from Tab and screen readers while closed. On rail routes it
 * folds to 64px icons.
 */
export function AppSidebar({
  sections,
  signals,
  pathname,
  onMeetHost,
  isProducer,
  rail,
  drawerOpen,
  onCloseDrawer,
  onDismissDrawer
}: {
  sections: SidebarNavSection[];
  signals: NavSignals;
  pathname: string;
  onMeetHost: boolean;
  isProducer: boolean;
  rail: boolean;
  drawerOpen: boolean;
  /** A link in the drawer was followed. */
  onCloseDrawer: () => void;
  /** The close button: closes and returns focus to the button that opened the drawer. */
  onDismissDrawer: () => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const closeButton = useRef<HTMLButtonElement>(null);
  const modal = drawerOpen && !desktop;

  useEffect(() => {
    if (!modal) return;
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [modal]);
  const main = sections.filter((section) => section.label !== "footer");
  const footer = sections.find((section) => section.label === "footer");

  function renderItem(item: SidebarNavItem) {
    return (
      <li key={item.id}>
        <SidebarNavLink
          item={item}
          icon={navIconFor(item.id, isProducer)}
          active={isNavItemActive(item, pathname, onMeetHost, isProducer)}
          signal={signals[item.id]}
          rail={rail}
          railTooltips={rail && desktop}
        />
      </li>
    );
  }

  // Any link in the drawer closes it (the route change would too, but not for external links).
  function closeOnLink(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) onCloseDrawer();
  }

  return (
    <aside
      id={DRAWER_ID}
      aria-label="Main menu"
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? true : undefined}
      className={cn(
        "fixed inset-y-0 left-0 z-[60] flex h-dvh w-[min(240px,85vw)] flex-col border-r border-border bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] transition-[transform,visibility] duration-200 ease-out lg:z-40",
        rail && "lg:w-16",
        // Closed below 1024px: off screen and out of the tab order (visibility waits for the slide).
        drawerOpen ? "translate-x-0" : "-translate-x-full max-lg:invisible lg:translate-x-0"
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3",
          rail && "lg:justify-center lg:px-0"
        )}
      >
        <Link href="/dashboard" className="flex min-w-0 items-center rounded-md px-1" aria-label="InFocus Portal home">
          <BrandWordmark className={cn("h-8 w-auto object-contain", rail && "lg:hidden")} width={75} height={32} priority />
          {rail ? (
            <Image src="/favicon/infocus-hub-icon.png" alt="" width={32} height={32} className="hidden h-8 w-8 lg:block" />
          ) : null}
        </Link>
        <button
          ref={closeButton}
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          onClick={onDismissDrawer}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav
        aria-label="Sections"
        className={cn(
          "flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          rail && "lg:px-2"
        )}
        onClick={closeOnLink}
      >
        {main.map((section) => (
          <div key={section.label ?? "top"} className={cn(section.label === null && "pt-[0.675rem]")}>
            {section.label ? <SectionLabel label={section.label} rail={rail} /> : null}
            <ul className="flex flex-col gap-0.5">{section.items.map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      {footer ? (
        <nav
          aria-label="Admin and settings"
          className={cn("shrink-0 border-t border-border px-3 py-2", rail && "lg:px-2")}
          onClick={closeOnLink}
        >
          <ul className="flex flex-col gap-0.5">{footer.items.map(renderItem)}</ul>
        </nav>
      ) : null}
    </aside>
  );
}
