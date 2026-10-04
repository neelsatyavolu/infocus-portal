"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useVisualViewport } from "./use-call-helpers";

/**
 * Right-hand panel on desktop; on phones a full-height bottom sheet sized to the visual viewport,
 * so the on-screen keyboard never covers the footer (chat input).
 */
export function SidePanel({
  title,
  onClose,
  mobile,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  mobile: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const viewport = useVisualViewport();
  const sheetStyle: CSSProperties | undefined =
    mobile && viewport ? { top: viewport.top, height: viewport.height } : undefined;

  return (
    <aside
      aria-label={title}
      role={mobile ? "dialog" : undefined}
      aria-modal={mobile ? true : undefined}
      style={sheetStyle}
      className={cn(
        "flex flex-col border-[var(--ink-4)] bg-[var(--ink-2)]",
        mobile
          ? "fixed inset-x-0 top-0 z-40 h-dvh overscroll-contain pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
          : "w-[22rem] shrink-0 border-l"
      )}
    >
      <header className="flex items-center justify-between border-b border-[var(--ink-4)] px-4 py-1.5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
        >
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer ? (
        <div className={cn("border-t border-[var(--ink-4)] p-3", mobile && "pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
