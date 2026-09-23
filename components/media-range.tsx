import { cn } from "@/src/lib/utils";

type MediaRangeProps = {
  value: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
  className?: string;
};

/** Thin player-style slider: styled track and thumb over an invisible native range input. */
export function MediaRange({ value, max, step, label, onChange, className }: MediaRangeProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className={cn("group/range relative h-4", className)}>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={Math.min(value, max)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0"
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-foreground/15 transition-[height] group-hover/range:h-1.5">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow transition-transform group-hover/range:scale-125 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
