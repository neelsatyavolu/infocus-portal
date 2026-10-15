import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { CountBadge } from "@/components/kit/status-tag";
import { cn } from "@/src/lib/utils";

export type SegmentState = "done" | "current" | "upcoming" | "locked";

export type SegmentItem = {
  key: string;
  /** Small mono number before the label (1, 2, 3…). */
  index?: number | string;
  label: ReactNode;
  state: SegmentState;
  /** The page being viewed (gets the tint and aria-current). Defaults to state === "current". */
  active?: boolean;
  href?: string;
  onSelect?: () => void;
  /** A StatusTag (size="sm") on the second line. */
  tag?: ReactNode;
  /** Unread / waiting count on the first line. */
  count?: number;
  countLabel?: string;
  /** Muted text on the second line ("Due Thu", "2 execs left"). */
  meta?: ReactNode;
  /** Hover text; for locked cells, why it's locked. */
  title?: string;
};

const STRIP: Record<SegmentState, string> = {
  done: "border-t-[var(--brand-fill)]",
  current: "border-t-[var(--brand-green)]",
  upcoming: "border-t-[var(--ink-4)]",
  locked: "border-t-[var(--ink-4)]"
};

const COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-3 lg:grid-cols-6"
};

function Cell({ item, anyActive }: { item: SegmentItem; anyActive: boolean }) {
  const active = item.active ?? (!anyActive && item.state === "current");
  const locked = item.state === "locked";
  // "page" only for the cell whose page is open (explicit `active`); otherwise the current stage
  // is a "step" (Home's strip links to stages without being on them).
  const ariaCurrent = item.active === true ? (item.href ? "page" : "true") : item.state === "current" ? "step" : undefined;
  const className = cn(
    "flex h-full min-h-[3.75rem] min-w-0 flex-col justify-between gap-1.5 border-t-4 px-3 pb-2 pt-2 text-left transition-colors",
    STRIP[item.state],
    active ? "bg-[rgb(43_179_110/0.08)]" : !locked && (item.href || item.onSelect) && "hover:bg-[var(--ink-3)]",
    locked && "cursor-not-allowed opacity-50"
  );
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {item.index !== undefined ? (
          <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{item.index}</span>
        ) : null}
        <span className={cn("min-w-0 flex-1 truncate text-sm", active ? "font-semibold text-foreground" : item.state === "upcoming" || locked ? "text-muted-foreground" : "text-foreground")}>
          {item.label}
        </span>
        {item.state === "done" && !item.tag ? (
          <Check role="img" aria-label="Done" className="h-3.5 w-3.5 shrink-0 text-[var(--brand-green)]" />
        ) : null}
        {item.count ? <CountBadge count={item.count} srLabel={item.countLabel} /> : null}
      </span>
      {item.tag || item.meta ? (
        <span className="flex min-w-0 items-center gap-2">
          {item.tag}
          {item.meta ? <span className="min-w-0 truncate text-xs text-muted-foreground">{item.meta}</span> : null}
        </span>
      ) : null}
    </>
  );

  if (locked) {
    return (
      <span className={className} aria-disabled="true" title={item.title}>
        {body}
      </span>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href as never} className={className} title={item.title} aria-current={ariaCurrent}>
        {body}
      </Link>
    );
  }
  if (item.onSelect) {
    return (
      <button type="button" onClick={item.onSelect} className={className} title={item.title} aria-current={ariaCurrent}>
        {body}
      </button>
    );
  }
  return (
    <span className={className} title={item.title} aria-current={ariaCurrent}>
      {body}
    </span>
  );
}

/**
 * The flat stage strip (4px top rule per cell, DESIGN.md's lower-third strip): the package stage
 * bar, the Home stage timeline, a group's stage tabs, and — without hrefs — the read-only
 * approval path (Stage 1 producer → Stage 2 adviser → Stage 3 executives). One look for all.
 * Two cells per row on phones (or one scrolling row with `scrollOnPhone`), all in a row from sm.
 */
export function SegmentNav({
  items,
  ariaLabel,
  columns,
  scrollOnPhone = false,
  trailing,
  className
}: {
  items: SegmentItem[];
  ariaLabel: string;
  /** Defaults to the number of items. */
  columns?: 2 | 3 | 4 | 5 | 6;
  scrollOnPhone?: boolean;
  /** Links beside the strip (Cycle guide, Extension requests). */
  trailing?: ReactNode;
  className?: string;
}) {
  const anyActive = items.some((item) => item.active);
  const interactive = items.some((item) => item.href || item.onSelect);
  const cols = COLS[columns ?? Math.min(6, Math.max(2, items.length))];
  const list = (
    <ol
      className={cn(
        "min-w-0 flex-[999_1_520px] gap-2",
        scrollOnPhone
          ? "flex snap-x overflow-x-auto [scrollbar-width:none] *:w-[44%] *:shrink-0 *:snap-start sm:grid sm:overflow-visible sm:*:w-auto [&::-webkit-scrollbar]:hidden"
          : "grid grid-cols-2",
        cols
      )}
    >
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          <Cell item={item} anyActive={anyActive} />
        </li>
      ))}
    </ol>
  );
  const Wrapper = interactive ? "nav" : "div";
  return (
    <Wrapper aria-label={ariaLabel} className={cn("flex min-w-0 flex-wrap items-stretch gap-2", className)}>
      {list}
      {trailing ? <div className="flex flex-[1_1_auto] flex-wrap items-center justify-end gap-1">{trailing}</div> : null}
    </Wrapper>
  );
}

export type StepState = "done" | "current" | "upcoming" | "blocked" | "skipped";

const MARKER: Record<StepState, string> = {
  done: "border-[var(--brand-fill)] bg-[var(--brand-fill)] text-[var(--on-brand)]",
  current: "border-[var(--brand-green)] text-[var(--brand-green)]",
  upcoming: "border-[var(--ink-4)] text-muted-foreground",
  blocked: "border-danger/60 text-danger",
  skipped: "border-dashed border-[var(--ink-4)] text-muted-foreground"
};

/**
 * Numbered steps down the page (the cycle guide, an approval chain with details, agreement →
 * approvals). A square mono marker per step on a connecting line, the title with a tag and a
 * mono tally, then the body.
 */
export function StepList({
  steps,
  className
}: {
  steps: Array<{
    key?: string;
    title: ReactNode;
    body?: ReactNode;
    state?: StepState;
    /** StatusTag beside the title. */
    tag?: ReactNode;
    /** Mono count on the right ("2 of 3"). */
    tally?: ReactNode;
  }>;
  className?: string;
}) {
  return (
    <ol className={cn("min-w-0", className)}>
      {steps.map((step, index) => {
        const state = step.state ?? "upcoming";
        const last = index === steps.length - 1;
        return (
          <li key={step.key ?? index} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
            {!last ? <span aria-hidden className="absolute bottom-0 left-3 top-7 w-px -translate-x-1/2 bg-border" /> : null}
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 grid h-6 w-6 place-items-center rounded-sm border font-mono-broadcast text-[11px] font-medium tabular-nums",
                MARKER[state]
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className={cn("min-w-0", !last && "pb-5")}>
              <div className="flex min-h-7 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className={cn("text-sm font-semibold", state === "upcoming" || state === "skipped" ? "text-[var(--ink-text)]" : "text-foreground")}>
                  <span className="sr-only">{`Step ${index + 1}${state === "done" ? ", done" : state === "current" ? ", current" : ""}: `}</span>
                  {step.title}
                </p>
                {step.tag}
                {step.tally ? (
                  <span className="ml-auto font-mono-broadcast text-xs tabular-nums text-muted-foreground">{step.tally}</span>
                ) : null}
              </div>
              {step.body ? <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.body}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
