"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { useRememberedState } from "@/components/kit/remembered-state";
import { cn } from "@/src/lib/utils";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * A section whose body folds away: a full-width header row (chevron, label, mono count) with
 * optional h-8 actions that don't toggle it. The open state can be controlled, or remembered
 * per browser with `storageKey` (try/catch inside; falls back to `defaultOpen`).
 * `variant="row"` is a 40px caps row (folded lists); `section` is a real heading (`headingAs`,
 * h3 by default) whose text is the toggle button, so heading navigation still finds it.
 */
export function Disclosure({
  summary,
  count,
  actions,
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  storageKey,
  variant = "row",
  headingAs: Heading = "h3",
  className,
  bodyClassName,
  children
}: {
  summary: ReactNode;
  count?: number | null;
  actions?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  /** Remember open/closed in localStorage under this key (version it, e.g. "grades:how:v1"). */
  storageKey?: string;
  variant?: "row" | "section";
  /** Heading level for `variant="section"`. */
  headingAs?: "h2" | "h3" | "h4";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [remembered, setRemembered] = useRememberedState<boolean>(storageKey ?? "", defaultOpen, isBoolean);
  const open = openProp ?? (storageKey ? remembered : localOpen);

  function toggle() {
    const next = !open;
    if (openProp === undefined) {
      if (storageKey) setRemembered(next);
      else setLocalOpen(next);
    }
    onOpenChange?.(next);
  }

  const row = variant === "row";
  const toggleButton = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={toggle}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        row
          ? "h-10 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground"
          : "h-9 text-base font-semibold tracking-[-0.01em] text-foreground"
      )}
    >
      <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      <span className="min-w-0 truncate">{summary}</span>
      {count != null ? (
        <span className="font-mono-broadcast text-[11px] font-normal tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
  return (
    <div className={cn("min-w-0", className)}>
      <div className={cn("flex min-w-0 items-center gap-2", row ? "min-h-10" : "min-h-9")}>
        {row ? toggleButton : <Heading className="flex min-w-0 flex-1">{toggleButton}</Heading>}
        {actions ? <ActionBar size="sm">{actions}</ActionBar> : null}
      </div>
      <div id={bodyId} hidden={!open} className={cn(open && "pt-2", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

/** "Show 12 reviewed" / "Hide reviewed": a full-width footer toggle for a long list. */
export function DisclosureToggle({
  open,
  onToggle,
  closedLabel,
  openLabel,
  controls,
  className
}: {
  open: boolean;
  onToggle: () => void;
  closedLabel: ReactNode;
  openLabel: ReactNode;
  /** Id of the region it shows and hides. */
  controls?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className
      )}
    >
      {open ? openLabel : closedLabel}
      <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  );
}
