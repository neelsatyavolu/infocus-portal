import { Hand } from "lucide-react";
import { ordinal } from "@/src/lib/meetings/client/hands";
import { cn } from "@/src/lib/utils";

/**
 * Raised-hand plate for the top-left of a tile: a square-cornered (6px) amber plate with a large
 * hand and the queue number. Warning Amber (#F2A516) with Ink text as fixed hexes, so it reads the
 * same over video in both themes. `compact` is for small tiles and the phone self view.
 */
export function HandBadge({ position, compact, className }: { position: number; compact?: boolean; className?: string }) {
  return (
    <span
      role="status"
      aria-label={`Hand raised, ${ordinal(position)} in line`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-[#F2A516] font-mono font-semibold tabular-nums text-[#0F110F]",
        compact ? "h-6 px-1.5 text-xs" : "h-8 px-2 text-sm",
        className
      )}
    >
      <Hand className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} aria-hidden />
      {position}
    </span>
  );
}
