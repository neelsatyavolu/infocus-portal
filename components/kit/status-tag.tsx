import type { ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { Spinner } from "@/components/kit/spinner";
import {
  dueTone,
  formatCount,
  relativeDaysLabel,
  resolveTone,
  statusTagClass,
  type StatusToneInput
} from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

/**
 * THE status tag (DESIGN.md §10): 4px radius, 11px caps label, tint by tone. Use it for every
 * status — stage, approval, revisions, locked, due, live, saved — beside a title or in a row's
 * status slot. Never put status in an actions row and never make it button-sized.
 * A <span>, so it can sit inside headings, paragraphs and the PageHeader eyebrow.
 * Note: `.status-pill` is unlayered CSS, so a className that changes display, padding or
 * white-space needs `!` (or wrap the tag in a span and style the span).
 */
export function StatusTag({
  tone = "neutral",
  size = "md",
  icon,
  dot = false,
  spinner = false,
  title,
  srLabel,
  wrap = false,
  className,
  children
}: {
  tone?: StatusToneInput;
  /** md: 20px tall, 11px text (default). sm: 18px tall, 10px text, for dense rows and nav. */
  size?: "sm" | "md";
  /** 12px leading icon. */
  icon?: KitIcon | ReactNode;
  /** Small leading dot in the text color (the `live` tone already draws its red dot). */
  dot?: boolean;
  /** Leading spinner, for "Saving…" style states. */
  spinner?: boolean;
  /** Hover text. Defaults to the label when it's a string, so truncated tags stay readable. */
  title?: string;
  /** Extra words for screen readers ("Stage status: "). */
  srLabel?: string;
  /** Let a long label wrap instead of truncating (drops the fixed height). */
  wrap?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const resolved = resolveTone(tone);
  return (
    <span
      title={title ?? (typeof children === "string" ? children : undefined)}
      className={cn(
        // Element icons (`icon={<Lock />}`) get the same 12px as component icons.
        "status-pill max-w-full shrink-0 align-middle leading-none [&>svg]:size-3",
        size === "sm" && "status-pill-sm",
        // `.status-pill` is unlayered CSS, so overriding its nowrap/padding needs `!`.
        wrap ? "whitespace-normal! py-1! leading-tight" : size === "sm" ? "h-[18px]" : "h-5",
        statusTagClass(resolved),
        className
      )}
    >
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      {spinner ? <Spinner size="sm" /> : null}
      {!spinner && icon ? renderIcon(icon, "h-3 w-3") : null}
      {dot && resolved !== "live" ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /> : null}
      <span className={cn("min-w-0", !wrap && "truncate")}>{children}</span>
    </span>
  );
}

/** Same component under the name some screens asked for. */
export const StatusBadge = StatusTag;

export type StatusDotTone = "new" | "warning" | "danger" | "live" | "neutral";

const DOT_CLASS: Record<StatusDotTone, string> = {
  new: "bg-[var(--brand-green)]",
  warning: "bg-[var(--brand-amber)]",
  danger: "bg-[var(--danger-text)]",
  // The rec-dot pulse without the unlayered .rec-dot class (which would force 8px).
  live: "bg-[var(--brand-red)] motion-safe:animate-[rec-pulse_1.6s_cubic-bezier(0.65,0,0.35,1)_infinite]",
  neutral: "bg-muted-foreground"
};

/**
 * A small "something happened" mark for the sidebar rail, phone tabs, tabs and list rows.
 * `new` (green) for unread or new items, `warning` for due soon, `danger` for revisions or
 * overdue, `live` (Record Red, pulsing) only for something on air right now.
 */
export function StatusDot({
  tone = "new",
  size = 8,
  label,
  className
}: {
  tone?: StatusDotTone;
  size?: 6 | 8;
  /** Screen-reader words. Without it the dot is decorative (say it in nearby text instead). */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === 6 ? "h-1.5 w-1.5" : "h-2 w-2",
        DOT_CLASS[tone],
        className
      )}
    />
  );
}

export type CountBadgeTone = "brand" | "onBrand" | "neutral" | "warning" | "danger" | "quiet";

const COUNT_CLASS: Record<CountBadgeTone, string> = {
  brand: "bg-[var(--brand-fill)] text-[var(--on-brand)]",
  onBrand: "bg-[var(--on-brand)] text-[var(--brand-fill)]",
  neutral: "bg-[var(--ink-3)] text-foreground",
  warning: "bg-[rgb(242_165_22/0.16)] text-[var(--brand-amber)]",
  danger: "bg-[var(--danger)] text-[var(--on-brand)]",
  quiet: "bg-transparent px-0 text-[var(--brand-green)]"
};

/**
 * A count for nav items, tabs, list headers and icon-button corners: Geist Mono, tabular,
 * 11px, 4px radius, "99+" past the cap. Renders nothing below 1 unless `showZero`.
 * `brand` for unread/needs-you, `onBrand` on an active green item, `neutral` for plain totals,
 * `quiet` for a bare green number (the mockup's sidebar counts).
 */
export function CountBadge({
  count,
  max = 99,
  tone = "brand",
  srLabel,
  showZero = false,
  className
}: {
  count: number;
  max?: number;
  tone?: CountBadgeTone;
  /** "3 unread" — the full meaning for screen readers. The visible text is just the number. */
  srLabel?: string;
  showZero?: boolean;
  className?: string;
}) {
  if (!showZero && !(count >= 1)) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm px-1 font-mono-broadcast text-[11px] font-medium leading-none tabular-nums",
        COUNT_CLASS[tone],
        className
      )}
    >
      <span aria-hidden={srLabel ? true : undefined}>{formatCount(count, max)}</span>
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </span>
  );
}

export type SaveStateValue = "idle" | "saving" | "saved" | "dirty" | "error";

/**
 * Autosave state as a tag: Saving… / Saved / N unsaved / Couldn't save. Shared by every
 * editor that saves on its own. `idle` renders nothing unless `idleLabel` is given.
 */
export function SaveState({
  state,
  count,
  idleLabel,
  savedLabel = "Saved",
  savingLabel = "Saving…",
  errorLabel = "Couldn't save",
  title,
  className
}: {
  state: SaveStateValue;
  /** Unsaved changes, shown as "3 unsaved" while dirty. */
  count?: number;
  idleLabel?: string;
  savedLabel?: string;
  savingLabel?: string;
  errorLabel?: string;
  title?: string;
  className?: string;
}) {
  let tag: ReactNode = null;
  if (state === "saving") {
    tag = (
      <StatusTag tone="neutral" spinner title={title}>
        {savingLabel}
      </StatusTag>
    );
  } else if (state === "saved") {
    tag = (
      <StatusTag tone="success" icon={Check} title={title}>
        {savedLabel}
      </StatusTag>
    );
  } else if (state === "dirty") {
    tag = (
      <StatusTag tone="warning" title={title}>
        {count && count > 0 ? `${formatCount(count)} unsaved` : "Unsaved"}
      </StatusTag>
    );
  } else if (state === "error") {
    tag = (
      <StatusTag tone="danger" icon={AlertTriangle} title={title}>
        {errorLabel}
      </StatusTag>
    );
  } else if (idleLabel) {
    tag = (
      <StatusTag tone="muted" title={title}>
        {idleLabel}
      </StatusTag>
    );
  }
  return (
    <span aria-live="polite" className={cn("inline-flex min-h-5 items-center", className)}>
      {tag}
    </span>
  );
}

/**
 * Due-date countdown tag ("Today", "in 3d", "2d ago") with the tone from how close it is.
 * The caller computes `days` (whole days from today, negative when past).
 */
export function DueTag({
  days,
  label,
  tone,
  title,
  size,
  className
}: {
  days: number;
  /** Replaces the countdown words, e.g. "Due Thu". */
  label?: string;
  tone?: StatusToneInput;
  /** Full date on hover, e.g. "Thursday, October 16". */
  title?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <StatusTag tone={tone ?? dueTone(days)} title={title} size={size} className={className}>
      {label ?? relativeDaysLabel(days)}
    </StatusTag>
  );
}
