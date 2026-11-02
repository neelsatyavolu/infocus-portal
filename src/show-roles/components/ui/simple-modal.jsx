import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";

export function Modal({ open, onClose, title, description, children, className }) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          "card-enter relative z-[121] max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-line-strong bg-card p-5 text-card-foreground",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium leading-none tracking-[-0.015em]">{title}</h2>
            {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors duration-150 ease-[var(--ease-ui)] hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
