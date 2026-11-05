import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { FillViewport } from "@/components/kit/fill-viewport";
import { cn } from "@/src/lib/utils";

/**
 * Page layouts. The app shell already gives every page ONE content column
 * (`mx-auto w-full max-w-[80rem]`, or the full main width on wide routes, see isWideRoute in
 * src/lib/sidebar-nav.ts). These split that column; none of them adds its own max-width.
 */

/**
 * Sticky list panes clear the shell's sticky top bar (`--app-header-h`, set by AppShell), and are
 * no taller than the window left below them (`--fill-viewport-h`, FillViewport), so a list page
 * opens without a page scroll.
 */
const STICKY_LIST = {
  lg: "lg:sticky lg:top-[calc(var(--app-header-h,0px)+1rem)] lg:max-h-[min(var(--fill-viewport-h,100dvh),calc(100dvh-var(--app-header-h,0px)-2rem))] lg:overflow-y-auto",
  md: "md:sticky md:top-[calc(var(--app-header-h,0px)+1rem)] md:max-h-[min(var(--fill-viewport-h,100dvh),calc(100dvh-var(--app-header-h,0px)-2rem))] md:overflow-y-auto"
} as const;

/**
 * List on the left, detail on the right (queues: Groups, requests, people). From `breakpoint`
 * up both panes show and the list sticks with its own scroll. Below it, one pane at a time: the
 * list, or the detail with a back bar (`showDetailOnPhone`). Both stay mounted.
 * `variant="card"` draws both panes inside one bordered card with a divider.
 */
export function ListDetail({
  list,
  detail,
  showDetailOnPhone,
  onBack,
  backLabel = "Back",
  listWidth = "22rem",
  breakpoint = "lg",
  variant = "split",
  stickyList = true,
  className
}: {
  list: ReactNode;
  detail: ReactNode;
  /** Phones: show the detail pane (with the back bar) instead of the list. */
  showDetailOnPhone: boolean;
  onBack?: () => void;
  backLabel?: string;
  listWidth?: string;
  breakpoint?: "md" | "lg";
  variant?: "split" | "card";
  stickyList?: boolean;
  className?: string;
}) {
  const lg = breakpoint === "lg";
  const card = variant === "card";
  return (
    <div
      style={{ "--list-w": listWidth } as CSSProperties}
      className={cn(
        "grid min-w-0 items-start",
        lg ? "lg:grid-cols-[var(--list-w)_minmax(0,1fr)]" : "md:grid-cols-[var(--list-w)_minmax(0,1fr)]",
        card ? "overflow-hidden rounded-md border border-border bg-card" : "gap-5",
        className
      )}
    >
      <FillViewport
        className={cn(
          "min-w-0",
          showDetailOnPhone && (lg ? "max-lg:hidden" : "max-md:hidden"),
          stickyList && !card && STICKY_LIST[breakpoint],
          card && (lg ? "lg:border-r lg:border-border" : "md:border-r md:border-border")
        )}
      >
        {list}
      </FillViewport>
      <div className={cn("min-w-0", !showDetailOnPhone && (lg ? "max-lg:hidden" : "max-md:hidden"))}>
        {onBack ? (
          <div className={cn("mb-3", lg ? "lg:hidden" : "md:hidden", card && "mb-0 border-b border-border px-2 py-1")}>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 items-center gap-1.5 rounded-md pr-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {backLabel}
            </button>
          </div>
        ) : null}
        {detail}
      </div>
    </div>
  );
}

/**
 * Main column plus a side rail (Home, The Show, Meetings): one column on phones, side by side
 * from `breakpoint`. The rail can come first on phones (a summary above the list).
 */
export function MainWithRail({
  rail,
  children,
  railWidth = "22rem",
  breakpoint = "xl",
  railFirstOnPhone = false,
  stickyRail = false,
  className
}: {
  rail: ReactNode;
  children: ReactNode;
  railWidth?: string;
  breakpoint?: "lg" | "xl";
  railFirstOnPhone?: boolean;
  stickyRail?: boolean;
  className?: string;
}) {
  const xl = breakpoint === "xl";
  return (
    <div
      style={{ "--rail-w": railWidth } as CSSProperties}
      className={cn(
        "grid min-w-0 items-start gap-5",
        xl ? "xl:grid-cols-[minmax(0,1fr)_var(--rail-w)]" : "lg:grid-cols-[minmax(0,1fr)_var(--rail-w)]",
        className
      )}
    >
      <div className={cn("min-w-0 space-y-5", railFirstOnPhone && (xl ? "max-xl:order-2" : "max-lg:order-2"))}>{children}</div>
      <aside
        className={cn(
          "min-w-0 space-y-5",
          stickyRail && (xl ? "xl:sticky xl:top-[calc(var(--app-header-h,0px)+1rem)]" : "lg:sticky lg:top-[calc(var(--app-header-h,0px)+1rem)]")
        )}
      >
        {rail}
      </aside>
    </div>
  );
}

/**
 * Equal-height card grid that fits as many columns as the space allows (at least `minItemWidth`
 * each), so the same list is 1 column on a phone or in a rail and 3–4 on a wide page. Works from
 * the container's width, not the viewport's.
 */
export function CardGrid({
  minItemWidth = "18rem",
  gap = 4,
  className,
  children
}: {
  minItemWidth?: string;
  gap?: 3 | 4 | 5;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ "--card-min": minItemWidth } as CSSProperties}
      className={cn(
        "grid min-w-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--card-min)),1fr))] *:h-full",
        gap === 3 ? "gap-3" : gap === 5 ? "gap-5" : "gap-4",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * A row of tiles that scrolls sideways inside itself on phones (snapping) and becomes a grid
 * from sm, so the page never scrolls sideways (proof tiles, A-roll clips, upcoming shows).
 */
export function ScrollStrip({
  children,
  gridClassName = "sm:grid-cols-3",
  itemWidth = "80%",
  className,
  "aria-label": ariaLabel
}: {
  children: ReactNode;
  /** Grid columns from sm, e.g. "sm:grid-cols-2 lg:grid-cols-4". */
  gridClassName?: string;
  /** Width of each tile on phones. */
  itemWidth?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      style={{ "--strip-item": itemWidth } as CSSProperties}
      className={cn(
        "flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] *:w-[var(--strip-item)] *:shrink-0 *:snap-start sm:grid sm:overflow-visible sm:pb-0 sm:*:w-auto [&::-webkit-scrollbar]:hidden",
        gridClassName,
        className
      )}
    >
      {children}
    </div>
  );
}

/** "On this page" anchor chips for long reading pages; scroll sideways on phones. */
export function JumpLinks({
  links,
  hideFrom,
  className
}: {
  links: Array<{ href: `#${string}`; label: string }>;
  /** Hide where a side rail already lists the sections. */
  hideFrom?: "lg";
  className?: string;
}) {
  return (
    <nav aria-label="On this page" className={cn("min-w-0", hideFrom === "lg" && "lg:hidden", className)}>
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => (
          <li key={link.href} className="shrink-0">
            <a
              href={link.href}
              className="inline-flex h-8 items-center rounded-md border border-input px-3 text-[13px] text-[var(--ink-text)] transition-colors hover:bg-[var(--ink-3)] hover:text-foreground"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
