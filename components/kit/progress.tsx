import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

export type ProgressTone = "brand" | "success" | "warning" | "danger" | "neutral" | "auto";

const FILL: Record<Exclude<ProgressTone, "auto">, string> = {
  brand: "bg-[var(--brand-fill)]",
  success: "bg-[var(--brand-green)]",
  warning: "bg-[var(--brand-amber)]",
  danger: "bg-[var(--danger-text)]",
  neutral: "bg-muted-foreground"
};

/** Clamp to 0–100; null/NaN stays null (an empty track keeps the height). */
export function clampPercent(value: number | null | undefined, max = 100): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || !(max > 0)) return null;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/** `auto` tone: green from 80%, amber from 50%, Danger below. */
export function autoProgressTone(percent: number | null): Exclude<ProgressTone, "auto"> {
  if (percent === null) return "neutral";
  if (percent >= 80) return "success";
  if (percent >= 50) return "warning";
  return "danger";
}

/**
 * One progress track (uploads, hours toward a goal, grade meters). A full-round bar is allowed
 * here (DESIGN.md §14). The value can sit under it in Geist Mono.
 */
export function ProgressBar({
  value,
  max = 100,
  tone = "brand",
  size = "sm",
  label,
  caption,
  showValue = false,
  className
}: {
  /** In units of `max` (0–100 by default). null draws an empty track. */
  value: number | null | undefined;
  max?: number;
  tone?: ProgressTone;
  /** xs: 4px, sm: 6px. */
  size?: "xs" | "sm";
  /** aria-label for the bar. */
  label: string;
  /** Text under the bar (left); `showValue` adds the mono percent on the right. */
  caption?: ReactNode;
  showValue?: boolean;
  className?: string;
}) {
  const percent = clampPercent(value, max);
  const fill = FILL[tone === "auto" ? autoProgressTone(percent) : tone];
  // Spans (display: block) so a bar can sit inside a button, such as a StatTile filter.
  return (
    <span className={cn("block min-w-0", className)}>
      <span
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
        className={cn("block w-full overflow-hidden rounded-full bg-[var(--ink-3)]", size === "xs" ? "h-1" : "h-1.5")}
      >
        {percent !== null ? (
          <span className={cn("block h-full rounded-full transition-[width] duration-200", fill)} style={{ width: `${percent}%` }} />
        ) : null}
      </span>
      {caption || showValue ? (
        <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{caption}</span>
          {showValue && percent !== null ? (
            <span className="font-mono-broadcast tabular-nums">{Math.round(percent)}%</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

export type ProgressSegmentState = "done" | "current" | "later";

/**
 * The mockups' tiny N-segment stage bar (done = InFocus Green, current = Green on Dark,
 * later = Ink 4). For stage progress at a glance in rows, cards and the Home rail.
 */
export function ProgressSegments({
  segments,
  label,
  size = "sm",
  className
}: {
  segments: ProgressSegmentState[];
  /** Spoken summary, e.g. "2 of 5 stages done". */
  label: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={cn("flex w-full min-w-0 gap-1", className)}>
      {segments.map((state, index) => (
        <span
          key={index}
          className={cn(
            "flex-1 rounded-[1px]",
            size === "xs" ? "h-[3px]" : "h-1",
            state === "done" ? "bg-[var(--brand-fill)]" : state === "current" ? "bg-[var(--brand-green)]" : "bg-[var(--ink-4)]"
          )}
        />
      ))}
    </div>
  );
}
