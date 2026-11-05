import type { ReactNode } from "react";
import { ActionBar } from "@/components/kit/action-bar";
import { cn } from "@/src/lib/utils";

/**
 * A centered square nameplate for whole-screen states outside the normal page flow: a meeting
 * lobby, "the call ended", opens-at, access denied, not found, maintenance, error boundaries.
 * The same plate as PageHeader (Ink 2, green strip), with an optional data block and actions.
 * Server-safe; renders its own centering box (full viewport height by default).
 */
export function StatusPlate({
  eyebrow,
  tag,
  title,
  body,
  children,
  actions,
  ariaLive = false,
  fullHeight = true,
  className
}: {
  eyebrow?: ReactNode;
  /** A StatusTag beside the eyebrow (LIVE, Restricted, Maintenance). */
  tag?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** A data block under the words (KeyValueList, a countdown). */
  children?: ReactNode;
  /** h-9 buttons; primary last. */
  actions?: ReactNode;
  /** Announce changes (waiting rooms). */
  ariaLive?: boolean;
  fullHeight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid w-full place-items-center px-4 py-10", fullHeight && "min-h-dvh", className)}>
      <section aria-live={ariaLive ? "polite" : undefined} className="brand-hero-panel w-full max-w-lg px-5 py-6 md:px-6">
        {eyebrow || tag ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {tag}
          </div>
        ) : null}
        <h1 className={cn("display-md text-foreground", (eyebrow || tag) && "mt-1.5")}>{title}</h1>
        {body ? <div className="mt-2 text-sm leading-relaxed text-[var(--ink-text)]">{body}</div> : null}
        {children ? <div className="mt-5">{children}</div> : null}
        {actions ? (
          <ActionBar fullWidthOnPhone className="mt-6">
            {actions}
          </ActionBar>
        ) : null}
      </section>
    </div>
  );
}
