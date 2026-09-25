"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BrandWordmark } from "@/components/brand-wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/src/lib/utils";

type EquipmentShellProps = {
  children: ReactNode;
  dashboardUrl: string;
};

const NAV = [
  { href: "/equipment", label: "Checkout" },
  { href: "/equipment/request", label: "Request" },
  { href: "/equipment/manage", label: "Manage", manageOnly: true }
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/equipment") {
    return pathname === "/equipment" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Minimal chrome for equipment.infocuspaly.com — kiosk + manage with a
 * single way back to the packages dashboard. No main app sidebar.
 */
export function EquipmentShell({ children, dashboardUrl }: EquipmentShellProps) {
  const pathname = usePathname() ?? "/equipment";
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/equipment/me")
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: { canManage?: boolean } } | null;
        if (!cancelled && res.ok) {
          setCanManage(Boolean(body?.data?.canManage));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanManage(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-[var(--ink)] px-3 py-1.5 sm:px-4">
        <a
          href={dashboardUrl}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </a>

        <div className="h-5 w-px bg-border" />

        <div className="flex min-w-0 items-center gap-2">
          <BrandWordmark className="h-6 w-auto object-contain" width={140} height={48} priority />
          <span className="hidden truncate text-[13px] font-semibold text-foreground sm:inline">Equipment</span>
        </div>

        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {NAV.map((item) => {
            if ("manageOnly" in item && item.manageOnly && !canManage) {
              return (
                <Link key={item.href} href="/sign-in?returnTo=/equipment/manage" className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:bg-card hover:text-foreground">
                  Dashboard sign-in
                </Link>
              );
            }
            const active = navActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href as never}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition",
                  active
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <a
          href={dashboardUrl}
          className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-accent"
        >
          Back to InFocus Portal
        </a>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
