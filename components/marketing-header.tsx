import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { MarketingMobileNav, type MarketingNavItem } from "@/components/marketing-mobile-nav";
import { HeaderAccount, MenuAccount } from "@/components/public-marketing/header-account";
import { PUBLIC_CONTAINER, type MarketingActive } from "@/components/public-marketing/shared";
import { equipmentAppOrigin } from "@/src/lib/hosts";
import { cn } from "@/src/lib/utils";

type MarketingHeaderProps = {
  active?: MarketingActive;
};

/** Portal pages (they need sign-in, so no prefetch), then the other apps. */
function marketingNavItems(): MarketingNavItem[] {
  const equipment: MarketingNavItem =
    process.env.NODE_ENV === "production"
      ? { href: equipmentAppOrigin(), label: "Equipment", key: "equipment", external: true, group: "tools" }
      : { href: "/equipment", label: "Equipment", key: "equipment", external: false, group: "tools" };

  return [
    { href: "/show-roles", label: "The Show", key: "show-roles", external: false, group: "portal", prefetch: false },
    { href: "/master-calendar", label: "Master Calendar", key: "master-calendar", external: false, group: "portal", prefetch: false },
    { href: "/package-cycles", label: "Cycle Dates", key: "package-cycles", external: false, group: "portal", prefetch: false },
    { href: "/package-progress", label: "Package Cycle", key: "package-progress", external: false, group: "portal", prefetch: false },
    equipment,
    { href: "https://drive.infocuspaly.com", label: "InFocus Drive", key: "drive", external: true, group: "tools" }
  ];
}

/** Desktop nav link: plain text, with the hub-tabs 2px green underline on the header's bottom line. */
function DesktopNavLink({ item, active }: { item: MarketingNavItem; active: boolean }) {
  const className = cn(
    "relative inline-flex h-14 items-center gap-1 whitespace-nowrap px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
  );
  const underline = active ? (
    <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 bg-[var(--brand-green)]" />
  ) : null;

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {item.label}
        <ArrowUpRight className="h-4 w-4 opacity-60" aria-hidden />
        <span className="sr-only"> (opens in a new tab)</span>
        {underline}
      </a>
    );
  }

  return (
    <Link href={item.href as Route} prefetch={item.prefetch} aria-current={active ? "page" : undefined} className={className}>
      {item.label}
      {underline}
    </Link>
  );
}

/**
 * The public header: wordmark, the site nav right after it (xl and up), and on the right the
 * account controls, then the menu toggle (below xl). Every control is h-9 in a 56px row that
 * shares the page column's edges. The session part streams in, so the page doesn't wait on it.
 */
export function MarketingHeader({ active = "home" }: MarketingHeaderProps) {
  const items = marketingNavItems();
  const portalItems = items.filter((item) => item.group === "portal");
  const toolItems = items.filter((item) => item.group === "tools");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className={cn(PUBLIC_CONTAINER, "flex h-14 items-center gap-3")}>
        <Link href="/" aria-label="InFocus Portal home" className="inline-flex shrink-0 items-center text-foreground">
          <BrandWordmark className="h-8 w-auto object-contain" priority />
        </Link>

        <nav aria-label="Site" className="ml-6 hidden items-center xl:flex">
          {portalItems.map((item) => (
            <DesktopNavLink key={item.key} item={item} active={active === item.key} />
          ))}
          <span aria-hidden className="mx-2 h-5 w-px bg-border" />
          {toolItems.map((item) => (
            <DesktopNavLink key={item.key} item={item} active={active === item.key} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={<div className="h-9 w-24" aria-hidden />}>
            <HeaderAccount />
          </Suspense>
          <MarketingMobileNav
            items={items}
            active={active}
            footer={
              <Suspense fallback={null}>
                <MenuAccount />
              </Suspense>
            }
          />
        </div>
      </div>
    </header>
  );
}
