"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavSignal, SidebarNavItem } from "@/src/lib/sidebar-nav";
import { cn } from "@/src/lib/utils";
import type { NavIcon } from "@/components/shell/nav-items";
import { PREFETCH_PAGE_ON_HOVER } from "@/components/shell/nav-link-prefetch";
import { NavCornerDot, NavStatusSlot } from "@/components/shell/nav-signal";

/**
 * One sidebar item: 16px icon, 14px label, and a status slot on the right. 40px tall in the
 * phone drawer, 36px on desktop. In the icon rail (lg, rail routes) only the icon shows, with
 * a corner dot for any signal and a tooltip that says the label and the signal in words.
 * My package grows a second line (stage + tag) only when there is something to act on.
 */
export function SidebarNavLink({
  item,
  icon: Icon,
  active,
  signal,
  rail,
  railTooltips
}: {
  item: SidebarNavItem;
  icon: NavIcon;
  active: boolean;
  signal?: NavSignal;
  /** The folded icon rail on large screens (the phone drawer always shows labels). */
  rail: boolean;
  /** Tooltips only where the rail is actually showing (desktop). */
  railTooltips: boolean;
}) {
  const line = signal?.line;
  const className = cn(
    "relative flex w-full flex-col justify-center rounded-md px-2.5 text-sm font-medium transition-colors duration-150 ease-[var(--ease-ui)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
    line ? "min-h-10 gap-0.5 py-1.5 lg:min-h-9" : "h-10 lg:h-9",
    rail && "lg:h-9 lg:min-h-0 lg:items-center lg:px-0 lg:py-0",
    active
      ? "bg-secondary text-foreground [&>span:first-child>span:first-child>svg]:text-brand-green"
      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
  );

  const body = (
    <>
      <span className={cn("flex w-full min-w-0 items-center gap-2.5", rail && "lg:justify-center")}>
        <span className="relative flex shrink-0">
          <Icon className="h-4 w-4" aria-hidden />
          {rail ? <NavCornerDot signal={signal} className="absolute -right-1 -top-1 hidden lg:block" /> : null}
        </span>
        <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", rail && "lg:sr-only")}>
          <span className="min-w-0 truncate">{item.label}</span>
          {item.external ? <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden /> : null}
          {item.newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </span>
        <span className={cn("contents", rail && "lg:hidden")}>
          <NavStatusSlot signal={signal} active={active} />
        </span>
        {rail && signal ? <span className="sr-only hidden lg:inline">{signal.label}</span> : null}
      </span>
      {line ? (
        <span className={cn("flex min-w-0 items-center gap-2 pl-[1.625rem] text-xs font-normal", rail && "lg:hidden")}>
          <span className={cn("min-w-0 truncate", "text-muted-foreground")}>
            {line.stageLabel}
          </span>
          <span className="inline-flex shrink-0 rounded-full">
            <StatusTag tone={line.tag.tone}>
              {line.tag.label}
            </StatusTag>
          </span>
        </span>
      ) : null}
    </>
  );

  const link: ReactNode = item.external ? (
    <a
      href={item.href}
      className={className}
      aria-current={active ? "page" : undefined}
      {...(item.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {body}
    </a>
  ) : (
    <Link
      href={item.href as never}
      {...PREFETCH_PAGE_ON_HOVER}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {body}
    </Link>
  );

  if (!rail || !railTooltips) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-[16rem]">
        <span className="block font-medium text-foreground">{item.label}</span>
        {signal ? <span className="block text-muted-foreground">{signal.label}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
