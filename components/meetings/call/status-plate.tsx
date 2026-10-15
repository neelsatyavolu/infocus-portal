import type { ReactNode } from "react";
import { ActionBar } from "@/components/kit/action-bar";
import { StatusPlate } from "@/components/kit/status-plate";
import { cn } from "@/src/lib/utils";

/**
 * Every whole-screen state around a call (joining, opens-at, lobby, denied, the end screens, the
 * crash screen, "no producer meeting", the link-preview page) is the kit StatusPlate, so it
 * matches the Portal's other standalone screens (access denied, errors). This wrapper adds only
 * what the call needs around it: the call's Ink background, the safe areas (the iPhone app runs
 * edge to edge), an optional muted context line, and the kit's touch-size action row (40px on
 * phones, full width; 36px from md), primary last.
 * Server-safe: no hooks, so route files (page.tsx, error.tsx, the preview page) use it too.
 */
export function CallPlate({
  eyebrow,
  tag,
  title,
  body,
  context,
  children,
  actions,
  ariaLive = false
}: {
  eyebrow: ReactNode;
  /** A StatusTag beside the eyebrow (never in the actions). */
  tag?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Small muted line under the body (the meeting's name in the lobby). */
  context?: ReactNode;
  /** Data block (countdown, error detail). */
  children?: ReactNode;
  actions?: ReactNode;
  /** Announce changes (every call screen: lobby, joining, opens-at, the end screens). */
  ariaLive?: boolean;
}) {
  const words =
    body || context ? (
      <>
        {body ? <p>{body}</p> : null}
        {context ? <p className="mt-1 truncate text-[13px] text-muted-foreground">{context}</p> : null}
      </>
    ) : undefined;
  const block =
    children || actions ? (
      <>
        {children}
        {actions ? (
          // The kit puts its own actions 24px under the words; the data slot already adds 20px.
          <ActionBar size="touch" fullWidthOnPhone className={cn(children ? "mt-6" : "mt-1")}>
            {actions}
          </ActionBar>
        ) : null}
      </>
    ) : undefined;
  return (
    <main className="flex min-h-dvh flex-col bg-[var(--ink)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
      <StatusPlate eyebrow={eyebrow} tag={tag} title={title} body={words} ariaLive={ariaLive} fullHeight={false} className="flex-1">
        {block}
      </StatusPlate>
    </main>
  );
}

/** The plate's data block: an Ink 3 box with a caps label (OPENS IN, DETAILS). */
export function PlateData({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-[var(--ink-3)] p-4", className)}>
      {label ? <p className="text-[11px] font-medium uppercase leading-none tracking-[0.11em] text-muted-foreground">{label}</p> : null}
      <div className={cn(label && "mt-2")}>{children}</div>
    </div>
  );
}
