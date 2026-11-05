import type { ReactNode } from "react";
import { ActionBar } from "@/components/kit/action-bar";
import { cn } from "@/src/lib/utils";

/**
 * Save / submit actions that stay in reach on long pages.
 * - Phones and tablets: fixed to the bottom, above the phone tab bar (`--phone-tabbar-h`) and
 *   the safe area, leaving a 4.5rem right gutter so the 48px ✱ launcher never covers an action.
 *   A spacer of the same height keeps the end of the page reachable.
 * - From `inlineFrom` up: `mode="inline"` sits in the page flow; `mode="sticky"` sticks to the
 *   bottom of its scroll container.
 * The status slot (left) holds a SaveState or a short reason the primary is disabled.
 */
export function StickyActionBar({
  status,
  children,
  visible = true,
  mode = "inline",
  inlineFrom = "lg",
  reserveLauncher = true,
  className
}: {
  status?: ReactNode;
  /** h-9 buttons, primary last. */
  children: ReactNode;
  /** Hide it (e.g. nothing to save). */
  visible?: boolean;
  mode?: "inline" | "sticky";
  inlineFrom?: "md" | "lg";
  reserveLauncher?: boolean;
  className?: string;
}) {
  if (!visible) return null;
  const md = inlineFrom === "md";
  return (
    <>
      <div aria-hidden className={cn("h-16", md ? "md:hidden" : "lg:hidden")} />
      <div
        className={cn(
          "fixed inset-x-0 bottom-[var(--phone-tabbar-h,0px)] z-30 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          reserveLauncher && "pr-[calc(max(1.25rem,env(safe-area-inset-right))+3.5rem)]",
          md
            ? "md:static md:z-auto md:border-t-0 md:bg-transparent md:p-0"
            : "lg:static lg:z-auto lg:border-t-0 lg:bg-transparent lg:p-0",
          mode === "sticky" &&
            (md
              ? "md:sticky md:bottom-4 md:rounded-md md:border md:bg-card md:px-4 md:py-3"
              : "lg:sticky lg:bottom-4 lg:rounded-md lg:border lg:bg-card lg:px-4 lg:py-3"),
          mode === "sticky" && reserveLauncher && (md ? "md:pr-[4.5rem]" : "lg:pr-[4.5rem]"),
          className
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[13px] text-muted-foreground">{status}</div>
          <ActionBar align="end" className="flex-nowrap">
            {children}
          </ActionBar>
        </div>
      </div>
    </>
  );
}
