"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

/**
 * Chrome for applications.<domain> (the Applicant Portal): no Portal sidebar, one top bar with the
 * wordmark, Apply / Review tabs (Review for reviewers only) and a way back to the Portal.
 */
export function ApplicationsShell({
  children,
  portalUrl,
  isReviewer,
}: {
  children: ReactNode;
  portalUrl: string;
  isReviewer: boolean;
}) {
  const pathname = usePathname() ?? "/applications";
  const onReview =
    pathname.startsWith("/applications/manage") ||
    pathname.startsWith("/manage");
  const tabs = [
    { href: "/applications", label: "Apply", active: !onReview },
    ...(isReviewer
      ? [{ href: "/applications/manage", label: "Review", active: onReview }]
      : []),
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground [--app-header-h:calc(3.5rem+env(safe-area-inset-top,0px))] print:bg-white print:text-black">
        <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-[var(--ink)] pt-[env(safe-area-inset-top)] print:hidden">
          <div className="px-4 md:px-6">
            <div
              className={cn(
                "mx-auto flex h-14 w-full min-w-0 items-center gap-3",
                onReview ? "max-w-[100rem]" : "max-w-[80rem]",
              )}
            >
              <div className="flex min-w-0 shrink-0 items-center gap-3">
                <BrandWordmark
                  className="h-6 w-auto object-contain"
                  width={140}
                  height={48}
                  priority
                />
                <span aria-hidden className="h-5 w-px bg-border" />
                <span className="text-[13px] font-semibold text-foreground">
                  Applications
                </span>
              </div>
              {tabs.length > 1 ? (
                <nav
                  aria-label="Applications"
                  className="ml-2 flex h-14 items-stretch gap-5 sm:ml-6"
                >
                  {tabs.map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href as never}
                      aria-current={tab.active ? "page" : undefined}
                      className={cn(
                        "relative inline-flex items-center px-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        tab.active
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                      {tab.active ? (
                        <span
                          aria-hidden
                          className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--brand-green)]"
                        />
                      ) : null}
                    </Link>
                  ))}
                </nav>
              ) : null}
              {/* Plain <a>: the Portal is on another origin. */}
              <a
                href={portalUrl}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "ml-auto shrink-0 text-[13px] max-sm:h-10 max-sm:w-10 max-sm:px-0",
                )}
              >
                <ArrowLeft aria-hidden />
                <span className="max-sm:sr-only">InFocus Portal</span>
              </a>
            </div>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pb-10 pt-4 outline-none md:px-6 md:pt-6 print:p-0"
        >
          <div
            className={cn(
              "mx-auto w-full min-w-0",
              onReview ? "max-w-[100rem]" : "max-w-[80rem]",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
