"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * One row recipe for the call's menus (Share, More, React live in the same family): 44px rows,
 * 16px icons, a title and an optional 12px detail line, Ink 3 on hover and keyboard focus.
 */
const MENU_ROW =
  "flex min-h-11 w-full gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export const MENU_SURFACE = "z-50 rounded-md border border-[var(--ink-4)] bg-[var(--ink-2)] p-1.5 text-sm outline-none";

export function MenuRow({
  icon,
  title,
  detail,
  onSelect
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={cn(MENU_ROW, detail ? "items-start [&_svg]:mt-0.5" : "items-center")} onClick={onSelect}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </button>
  );
}

/** Caps label above a group of menu rows (LAYOUT, SHORTCUTS). */
export function MenuLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase leading-none tracking-[0.11em] text-muted-foreground">
      {children}
    </p>
  );
}

export function MenuDivider() {
  return <div aria-hidden className="my-1.5 h-px bg-[var(--ink-4)]" />;
}
