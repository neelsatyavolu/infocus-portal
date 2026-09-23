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
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <section
        role="dialog"
        aria-modal="true"
        className={cn(
          "card-enter relative z-[121] w-full max-w-lg rounded-2xl border border-cyan-300/25 bg-card p-5 text-card-foreground shadow-2xl",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
            {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
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
