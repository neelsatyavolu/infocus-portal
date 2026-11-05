import Link from "next/link";
import type { ReactNode } from "react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { ProgressBar } from "@/components/kit/progress";
import { toneTextClass, type StatusToneInput } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

type StatBody = {
  label: ReactNode;
  value: ReactNode;
  /** Geist Mono tabular value (default). Turn off for words ("Thu 3:15"). */
  mono?: boolean;
  /** Unit after a mono value ("pts", "h"). */
  unit?: string;
  /** One muted line under the value. */
  hint?: ReactNode;
  /** StatusTag in the label row. */
  tag?: ReactNode;
  icon?: KitIcon | ReactNode;
  /** Colors the value: warning / danger / success. */
  tone?: StatusToneInput;
  /** 0–1. Draws a thin bar under the value. */
  progress?: number | null;
  /** Shows a pulsing block instead of the value. */
  loading?: boolean;
};

function StatContent({ label, value, mono = true, unit, hint, tag, icon, tone, progress, loading }: StatBody) {
  return (
    <>
      {/* Spans only (display: block where needed): the tile can be a <button>, which takes phrasing content. */}
      <span className="flex min-h-5 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground [&>svg]:size-3.5">
          {icon ? renderIcon(icon, "h-3.5 w-3.5") : null}
          <span className="truncate">{label}</span>
        </span>
        {tag}
      </span>
      {loading ? (
        <span aria-hidden className="mt-1 block h-7 w-16 rounded-sm bg-[var(--ink-3)] motion-safe:animate-pulse" />
      ) : (
        <span
          className={cn(
            "mt-1 block min-w-0 truncate leading-tight",
            mono ? "font-mono-broadcast text-[22px] font-medium tabular-nums" : "text-xl font-semibold tracking-[-0.01em]",
            tone ? toneTextClass(tone) : "text-foreground"
          )}
        >
          {value}
          {unit ? <span className="ml-1 text-[13px] font-normal text-muted-foreground">{unit}</span> : null}
        </span>
      )}
      {progress !== undefined ? (
        <ProgressBar value={progress === null ? null : progress * 100} size="xs" label={typeof label === "string" ? label : "Progress"} className="mt-2" />
      ) : null}
      {hint ? <span className="mt-1 block min-w-0 text-[13px] leading-snug text-muted-foreground">{hint}</span> : null}
    </>
  );
}

/**
 * At-a-glance number tile: caps label, a big mono value, one muted line, an optional tag and
 * bar. With `href` or `onClick` the whole tile is the control. Put tiles in a StatGrid so a row
 * is equal height.
 */
export function StatTile({
  href,
  onClick,
  pressed,
  className,
  ...body
}: StatBody & {
  href?: string;
  onClick?: () => void;
  /** With onClick: the tile is a filter toggle (aria-pressed). */
  pressed?: boolean;
  className?: string;
}) {
  const base = cn(
    "flex h-full min-w-0 flex-col rounded-md border bg-card p-4 text-left text-card-foreground",
    pressed ? "border-[var(--brand-green)] bg-[rgb(43_179_110/0.08)]" : "border-border",
    className
  );
  const interactive = "transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (href) {
    return (
      <Link href={href as never} className={cn(base, interactive)}>
        <StatContent {...body} />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={pressed} className={cn(base, interactive)}>
        <StatContent {...body} />
      </button>
    );
  }
  return (
    <div className={base}>
      <StatContent {...body} />
    </div>
  );
}

const GRID_COLS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6"
};

/** Equal-height grid of StatTiles: two across on phones, `columns` across from lg. */
export function StatGrid({
  columns = 4,
  className,
  children
}: {
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:gap-4 *:h-full", GRID_COLS[columns], className)}>{children}</div>;
}

const STRIP_COLS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6"
};

/**
 * Several numbers in ONE card, split by hairlines (summary bands, card footers, KPI rows).
 * Two cells per row on phones, all in one row from md (up to 4) or lg (5–6).
 */
export function MetricStrip({
  items,
  columns,
  className
}: {
  items: Array<StatBody & { key?: string; href?: string; title?: string }>;
  /** Defaults to the number of items (max 6). */
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const cols = columns ?? (Math.min(6, Math.max(2, items.length)) as 2 | 3 | 4 | 5 | 6);
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className={cn("-mb-px -mr-px grid grid-cols-2 *:border-b *:border-r *:border-border", STRIP_COLS[cols])}>
        {items.map(({ key, href, title, ...body }, index) => {
          const cell = cn(
            "flex min-w-0 flex-col p-4",
            href &&
              "transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          );
          const content = <StatContent {...body} />;
          return href ? (
            <Link key={key ?? index} href={href as never} title={title} className={cell}>
              {content}
            </Link>
          ) : (
            <div key={key ?? index} title={title} className={cell}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
