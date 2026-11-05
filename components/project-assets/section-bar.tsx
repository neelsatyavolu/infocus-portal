import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** A 32px section row: collapse chevron + caps label + mono count. */
export function SectionBar({
  id,
  label,
  count,
  open,
  onToggle
}: {
  /** The section body's id (only referenced while it's rendered, i.e. open). */
  id: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-8 min-w-0 items-center">
      <h2 className="min-w-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={onToggle}
          className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-sm px-1 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
          {label}
          <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{count}</span>
        </button>
      </h2>
    </div>
  );
}
