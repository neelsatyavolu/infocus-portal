"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ClipboardList, LogIn, ScanBarcode, Wrench, type LucideIcon } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { PHONE_TABBAR_ROOT_CLASS, PhoneTabBar } from "@/components/kit/phone-tab-bar";
import { Skeleton } from "@/components/kit/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

type EquipmentShellProps = {
  children: ReactNode;
  dashboardUrl: string;
};

type NavItem = { href: string; label: string; icon: LucideIcon };

const CHECKOUT: NavItem = { href: "/equipment", label: "Checkout", icon: ScanBarcode };
const REQUEST: NavItem = { href: "/equipment/request", label: "Request", icon: ClipboardList };
const MANAGE: NavItem = { href: "/equipment/manage", label: "Manage", icon: Wrench };
const SIGN_IN: NavItem = { href: "/sign-in?returnTo=/equipment/manage", label: "Dashboard sign-in", icon: LogIn };

/** Any toast sits above the phone tab bar, which shows below lg. */
const TOAST_OFFSET = "calc(3.75rem + env(safe-area-inset-bottom, 0px) + 1rem)";

function navActive(pathname: string, href: string) {
  if (href === "/equipment") {
    return pathname === "/equipment" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Lifts the Toaster (it reads `--toast-offset-bottom` on <html>) clear of the phone tab bar. */
function useToastOffset() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(max-width: 1023.98px)");
    const apply = () => {
      if (media.matches) root.style.setProperty("--toast-offset-bottom", TOAST_OFFSET);
      else root.style.removeProperty("--toast-offset-bottom");
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
      root.style.removeProperty("--toast-offset-bottom");
    };
  }, []);
}

/**
 * Focused chrome for equipment.infocuspaly.com (and /equipment on the main host): no Portal
 * sidebar. The top bar's row and the page share one container (padded, then max 80rem), so the
 * wordmark, the page header and the content all start on the same left edge. From lg the nav is
 * underline tabs in the top bar; below lg it is the Portal's phone tab bar at the bottom.
 * The third tab is Manage for people who can manage, and Dashboard sign-in for everyone else.
 */
export function EquipmentShell({ children, dashboardUrl }: EquipmentShellProps) {
  const pathname = usePathname() ?? "/equipment";
  // null while /api/equipment/me is loading, so the third tab never flickers from sign-in to Manage.
  const [canManage, setCanManage] = useState<boolean | null>(null);
  useToastOffset();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/equipment/me")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: { canManage?: boolean } } | null;
        // A failed check falls back to Dashboard sign-in, as before.
        if (!cancelled) setCanManage(res.ok && Boolean(body?.data?.canManage));
      })
      .catch(() => {
        if (!cancelled) setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = canManage === null;
  const items = [CHECKOUT, REQUEST, ...(pending ? [] : [canManage ? MANAGE : SIGN_IN])];
  const isActive = (item: NavItem) => item !== SIGN_IN && navActive(pathname, item.href);

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-background text-foreground",
        PHONE_TABBAR_ROOT_CLASS.lg,
        // Sticky panes (batch rail, request panel, list columns) sit below the top bar.
        "[--app-header-h:calc(3.5rem+env(safe-area-inset-top,0px))]"
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-[var(--ink)] pt-[env(safe-area-inset-top)]">
        <div className="px-4 md:px-6">
          <div className="mx-auto flex h-14 w-full min-w-0 max-w-[80rem] items-center gap-3">
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <BrandWordmark className="h-6 w-auto object-contain" width={140} height={48} priority />
              <span aria-hidden className="h-5 w-px bg-border" />
              <span className="text-[13px] font-semibold text-foreground">Equipment</span>
            </div>

            <nav aria-label="Equipment" className="ml-6 hidden h-14 items-stretch gap-6 lg:flex">
              {items.map((item) => (
                <TopTab key={item.href} item={item} active={isActive(item)} />
              ))}
              {pending ? (
                // Holds the slot's width until access is known, so nothing shifts or flickers.
                <span aria-hidden className="invisible inline-flex items-center px-0.5 text-sm">
                  {SIGN_IN.label}
                </span>
              ) : null}
            </nav>

            {/* Plain <a>: the Portal can be on another origin (full navigation). */}
            <a
              href={dashboardUrl}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "ml-auto shrink-0 text-[13px] max-sm:h-10 max-sm:w-10 max-sm:px-0"
              )}
            >
              <ArrowLeft aria-hidden />
              <span className="max-sm:sr-only">Back to InFocus Portal</span>
            </a>
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 pb-[calc(1.5rem+var(--phone-tabbar-h,0px)+env(safe-area-inset-bottom))] pt-4 outline-none md:px-6 md:pt-6 lg:pb-8"
      >
        <div className="mx-auto w-full min-w-0 max-w-[80rem]">{children}</div>
      </main>

      <PhoneTabBar
        ariaLabel="Equipment"
        items={items.map((item) => ({
          key: item.href,
          label: item.label,
          icon: item.icon,
          href: item.href,
          active: isActive(item)
        }))}
        // While access loads, the bar keeps a third of its width for the third tab.
        className={pending ? "pr-[33.3333%]" : undefined}
      />
      {pending ? (
        <span
          aria-hidden
          className="fixed bottom-[env(safe-area-inset-bottom)] right-0 z-40 flex h-[3.75rem] w-1/3 flex-col items-center justify-center gap-1 lg:hidden"
        >
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-2.5 w-12" />
          <span className="h-0.5 w-4" />
        </span>
      ) : null}
    </div>
  );
}

function TopTab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href as never}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex items-center px-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {item.label}
      {/* The 2px underline sits on the bar's bottom hairline, like HubTabs. */}
      {active ? <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--brand-green)]" /> : null}
    </Link>
  );
}
