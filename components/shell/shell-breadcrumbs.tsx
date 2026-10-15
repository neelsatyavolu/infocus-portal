"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { AppBreadcrumb } from "@/src/lib/app-breadcrumbs";
import { cn } from "@/src/lib/utils";
import type { ShellLinkClick } from "@/components/shell/use-shell-link";

/** A one-crumb trail only repeats the page's own header title, so the top bar shows none. */
export function showsBreadcrumbTrail(crumbs: AppBreadcrumb[]) {
  return crumbs.length >= 2;
}

/**
 * The top bar's trail, at every width: 13px, links muted with an underline on hover (no padded
 * pills, so the first crumb sits on the content column's edge), the last crumb foreground and
 * aria-current. It scrolls sideways when it doesn't fit and keeps the current page in view.
 * Render it only when showsBreadcrumbTrail(crumbs).
 */
export function ShellBreadcrumbs({ crumbs, onLinkClick }: { crumbs: AppBreadcrumb[]; onLinkClick: ShellLinkClick }) {
  const listRef = useRef<HTMLOListElement>(null);
  const trailKey = crumbs.map((crumb) => crumb.label).join("\u0000");

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollLeft = list.scrollWidth;
  }, [trailKey]);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center">
      <ol
        ref={listRef}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-[13px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const href = crumb.href;
          const textClass = "block max-w-[16rem] truncate";
          // Links are 40px tall on phones (touch target), text-height from md; vertical only, so the
          // first crumb still starts on the column edge.
          const linkClass = "inline-flex min-h-10 max-w-[16rem] items-center md:min-h-0";
          return (
            <li key={`${crumb.label}-${index}`} className="flex min-w-0 shrink-0 items-center gap-1.5">
              {href && !last ? (
                <Link
                  href={href as never}
                  onClick={(event) => onLinkClick(event, href)}
                  title={crumb.label}
                  className={cn(
                    linkClass,
                    "rounded-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : href ? (
                <Link
                  href={href as never}
                  onClick={(event) => onLinkClick(event, href)}
                  title={crumb.label}
                  aria-current="page"
                  className={cn(linkClass, "rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  <span className="truncate">{crumb.label}</span>
                </Link>
              ) : (
                <span
                  title={crumb.label}
                  aria-current={last ? "page" : undefined}
                  className={cn(textClass, last ? "font-medium text-foreground" : "text-muted-foreground")}
                >
                  {crumb.label}
                </span>
              )}
              {last ? null : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
