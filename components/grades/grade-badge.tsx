import { StatusTag } from "@/components/kit/status-tag";
import type { StatusToneInput } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

/**
 * A letter grade with its percent. Never a box of its own (status is not a button-sized block):
 * - full: the Overview band cell. Caps label, a big letter, the mono percent. On phones it is one
 *   row (letter left, label and percent stacked on the right).
 * - compact: one h-8 inline readout for a toolbar: a tag with the label, the letter, the percent.
 */
export function GradeBadge({
  letter,
  percentage,
  label,
  compact = false,
  tone = "neutral",
  className
}: {
  letter: string | null | undefined;
  percentage: number | null | undefined;
  label: string;
  compact?: boolean;
  /** compact only: the label tag's tone ("success" for a what-if). */
  tone?: StatusToneInput;
  className?: string;
}) {
  const gradeable = percentage !== null && percentage !== undefined;
  const pct = gradeable ? (
    <span className="font-mono-broadcast tabular-nums text-foreground">{percentage.toFixed(1)}%</span>
  ) : (
    <span className="text-muted-foreground">Not gradeable yet</span>
  );
  const letterClass = letter ? "text-[var(--brand-green)]" : "text-muted-foreground";

  if (compact) {
    return (
      <div className={cn("flex min-h-8 min-w-0 items-center gap-2.5", className)}>
        <StatusTag tone={tone}>{label}</StatusTag>
        <span className={cn("text-2xl font-semibold leading-none tracking-[-0.02em]", letterClass)}>{letter ?? "—"}</span>
        <span className="min-w-0 truncate text-sm">{pct}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 sm:grid-cols-1 sm:content-start sm:gap-y-1.5",
        className
      )}
    >
      <p className="col-start-2 row-start-1 self-end text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground sm:col-start-1">
        {label}
      </p>
      <p
        className={cn(
          "col-start-1 row-span-2 row-start-1 text-5xl font-semibold leading-none tracking-[-0.02em] sm:row-span-1 sm:row-start-2",
          letterClass
        )}
      >
        {letter ?? "—"}
      </p>
      <p className="col-start-2 row-start-2 self-start text-sm sm:col-start-1 sm:row-start-3">{pct}</p>
    </div>
  );
}
