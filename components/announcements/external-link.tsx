import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { COARSE_HIT_AREA, ROW_CONTROL } from "@/components/announcements/sizes";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

const STYLE = {
  /** Inside a line of text (card footers, header lines); a larger hit area on touch screens. */
  inline: cn(
    "inline-flex items-center gap-0.5 rounded-sm font-medium text-[var(--brand-green)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    COARSE_HIT_AREA
  ),
  /** A standalone link (panel links): a row control's height, 40px on phones and touch screens. */
  link: cn(
    "inline-flex items-center gap-1 rounded-sm text-sm font-medium text-[var(--brand-green)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ROW_CONTROL
  ),
  /** An outline button (toolbars). */
  outline: buttonVariants({ variant: "outline" })
} as const;

/**
 * The one rule for links that open a new tab in the Announcements hub: the words, then ↗,
 * and "(opens in a new tab)" for screen readers.
 */
export function ExternalLink({
  href,
  children,
  variant = "inline",
  className
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof STYLE;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(STYLE[variant], className)}>
      {children}
      <ArrowUpRight aria-hidden className={variant === "inline" ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
