import type { ReactNode } from "react";
import { Upload } from "lucide-react";
import type { useFileDrop } from "@/src/lib/use-file-drop";
import { cn } from "@/src/lib/utils";

/**
 * The shared drag-and-drop surface around src/lib/use-file-drop.ts: spread its `bind`, pass
 * `dragging`, and the children get a dashed green outline and a "Drop to upload" overlay while
 * files hover. Disabled zones show no overlay (use-file-drop already ignores the drop).
 */
export function Dropzone({
  bind,
  dragging,
  disabled = false,
  overlayLabel = "Drop to upload",
  className,
  children
}: {
  bind: ReturnType<typeof useFileDrop>["bind"];
  dragging: boolean;
  disabled?: boolean;
  overlayLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const active = dragging && !disabled;
  return (
    <div {...bind} className={cn("relative min-w-0 rounded-md", className)}>
      {children}
      {active ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-md border-2 border-dashed border-[var(--brand-green)] bg-[rgb(43_179_110/0.10)]"
        >
          <span className="inline-flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm font-medium text-foreground">
            <Upload className="h-4 w-4 text-[var(--brand-green)]" aria-hidden />
            {overlayLabel}
          </span>
        </div>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {active ? overlayLabel : ""}
      </span>
    </div>
  );
}
