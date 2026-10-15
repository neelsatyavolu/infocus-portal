import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * Joined outline buttons that share their borders (‹ Today ›, Previous / Next). The group has the
 * size's height and every child fills it, so inside an ActionBar/Toolbar it follows that row's
 * height. Give children `variant="outline"`.
 */
export function ButtonGroup({
  size = "md",
  className,
  children,
  "aria-label": ariaLabel
}: {
  size?: ControlSize;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-stretch",
        CONTROL_HEIGHT[size],
        "*:relative *:h-full *:rounded-none *:focus-visible:z-10 [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*:not(:first-child)]:-ml-px",
        className
      )}
    >
      {children}
    </div>
  );
}

const stepClass = cn(buttonVariants({ variant: "outline", size: "icon" }), "aspect-square w-auto px-0");
const disabledStepClass = cn(stepClass, "pointer-events-none opacity-50");

/**
 * [‹ label ›] with an optional reset ("This week", "Today"). One grouped control, so the week
 * label never jumps when the arrows are pressed. `children` replaces the label (e.g. a Select).
 */
export function DateStepper({
  label,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  previousDisabled = false,
  nextDisabled = false,
  onReset,
  resetLabel = "Today",
  isCurrent = false,
  size = "md",
  labelClassName,
  children
}: {
  label?: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  onReset?: () => void;
  resetLabel?: string;
  /** Disables the reset button (it stays in place so nothing shifts). */
  isCurrent?: boolean;
  size?: ControlSize;
  /** Width for the label cell, e.g. "min-w-[11rem]". */
  labelClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("inline-flex shrink-0 items-stretch gap-2 *:h-full", CONTROL_HEIGHT[size])}>
      <ButtonGroup size={size}>
        <button type="button" aria-label={previousLabel} title={previousLabel} onClick={onPrevious} disabled={previousDisabled} className={stepClass}>
          <ChevronLeft aria-hidden />
        </button>
        {children ?? (
          <span
            aria-live="polite"
            className={cn(
              "inline-flex min-w-[9rem] items-center justify-center border border-input px-3 text-sm font-medium text-foreground tabular-nums",
              labelClassName
            )}
          >
            {label}
          </span>
        )}
        <button type="button" aria-label={nextLabel} title={nextLabel} onClick={onNext} disabled={nextDisabled} className={stepClass}>
          <ChevronRight aria-hidden />
        </button>
      </ButtonGroup>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          disabled={isCurrent}
          className={cn(buttonVariants({ variant: "outline" }), "px-3")}
        >
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Previous / Next links for stepping through a list (groups, sets, weeks). A missing href keeps a
 * disabled twin in place, so the control never shifts. `position` shows "4 / 12" between them.
 */
export function PrevNextNav({
  previousHref,
  nextHref,
  previousLabel,
  nextLabel,
  position,
  keys,
  size = "md",
  children
}: {
  previousHref: string | null | undefined;
  nextHref: string | null | undefined;
  previousLabel: string;
  nextLabel: string;
  position?: { index: number; total: number };
  /** Shortcut letters shown in the hover text, e.g. ["K", "J"]. Bind them with useListHotkeys. */
  keys?: [string, string];
  size?: ControlSize;
  /** Middle control, e.g. a picker. Replaces `position`. */
  children?: ReactNode;
}) {
  const step = (href: string | null | undefined, text: string, key: string | undefined, icon: ReactNode) => {
    const title = key ? `${text} (${key})` : text;
    return href ? (
      <Link href={href as never} aria-label={text} title={title} className={stepClass}>
        {icon}
      </Link>
    ) : (
      <span role="link" aria-disabled="true" aria-label={text} title={text} className={disabledStepClass}>
        {icon}
      </span>
    );
  };
  const middle =
    children ??
    (position ? (
      <span className="inline-flex items-center border border-input px-3 font-mono-broadcast text-[13px] tabular-nums text-muted-foreground">
        {position.index} / {position.total}
      </span>
    ) : null);

  return (
    <ButtonGroup size={size} aria-label="Previous and next">
      {step(previousHref, previousLabel, keys?.[0], <ChevronLeft aria-hidden />)}
      {middle}
      {step(nextHref, nextLabel, keys?.[1], <ChevronRight aria-hidden />)}
    </ButtonGroup>
  );
}

/** "← Back to …" link, flush with the content's left edge. */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href as never}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}
