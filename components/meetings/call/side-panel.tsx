"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** Right-hand panel on desktop, full-screen sheet on phones. */
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
  return (
    <aside
      aria-label={title}
      className={cn(
        "flex flex-col border-[var(--ink-4)] bg-[var(--ink-2)]",
        mobile ? "fixed inset-0 z-40" : "w-[22rem] shrink-0 border-l"
      )}
    >
      <header className="flex items-center justify-between border-b border-[var(--ink-4)] px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer ? <div className="border-t border-[var(--ink-4)] p-3">{footer}</div> : null}
    </aside>
  );
}
