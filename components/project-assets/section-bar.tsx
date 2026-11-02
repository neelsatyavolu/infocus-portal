import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** A 32px section row: collapse chevron + sentence-case label + mono count. */
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
          className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-[var(--ease-ui)] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
          {label}
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{count}</span>
        </button>
      </h2>
    </div>
  );
}
