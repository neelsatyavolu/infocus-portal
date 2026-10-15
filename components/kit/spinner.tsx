import { Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** Busy indicator for buttons, rows and tags. Stops spinning under reduced motion. */
export function Spinner({
  size = "md",
  label,
  className
}: {
  /** sm: 12px (inside tags), md: 16px (inside buttons and rows). */
  size?: "sm" | "md";
  /** Read by screen readers; omit when the surrounding text already says it's busy. */
  label?: string;
  className?: string;
}) {
  return (
    <>
      <Loader2
        className={cn("shrink-0 motion-safe:animate-spin", size === "sm" ? "h-3 w-3" : "h-4 w-4", className)}
        aria-hidden
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
